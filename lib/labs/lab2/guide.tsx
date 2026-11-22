import { Eq, Figure, Frac, Note, Settings, Terms, V } from "@/components/guide/parts";
import { TIME_DIV, VOLTS_DIV } from "@/lib/controls/store";
import type { Guide, Section } from "@/lib/guide/types";
import { AmFigure, BlockDiagram, DepthFigure, DsbscFigure, ShiftFigure, SignalsFigure, SpectrumFigure } from "./figures";
import { BANK, QUESTIONS } from "./questions";

/**
 * Lab 2 — Amplitude Modulation.
 *
 * Sequence and settings follow the Experiment 2 lab sheet (message 2 kHz 4 Vp-p,
 * carrier 100 kHz 4 Vp-p, AM = (message + DC) × carrier). Every check below
 * reads the simulated circuit: which sockets are joined, and what voltage the
 * modules actually produce. Nothing is assumed from the step number.
 */

import {
  ADDER_A,
  ADDER_B,
  ADDER_OUT,
  CARRIER,
  CH1,
  CH2,
  MESSAGE,
  MULTIPLIERS,
  VDC,
  dcLevel,
  depth,
  describeEnvelope,
  envelope,
  messageLevel,
  messageWired,
  modulator,
  scopeShows,
  steady,
  triggerOnMessage,
} from "../am";


// ------------------------------------------------------------------ steps
const theory: Section = {
  id: "theory",
  title: "Understand the experiment",
  steps: [
    {
      id: "overview",
      kind: "theory",
      title: "What you are about to build",
      body: (
        <>
          <p>
            In this experiment you build a complete <strong>AM transmitter</strong> out of two simple operations, an
            addition and a multiplication, and watch its output on the oscilloscope.
          </p>
          <Figure caption="The whole experiment. The Adder shifts the message, the Multiplier puts it on the carrier.">
            <BlockDiagram />
          </Figure>
          <p>You will do three things:</p>
          <ol>
            <li>
              Prepare a <strong>2 kHz message</strong> of exactly 4 Vp-p and add a DC voltage to it.
            </li>
            <li>
              Multiply it by a <strong>100 kHz carrier</strong> to produce the AM signal.
            </li>
            <li>
              Change the DC to see <strong>under-modulation, 100% modulation and over-modulation</strong>, and measure
              the modulation depth from the screen.
            </li>
          </ol>
          <Note tone="key" title="How this guide works">
            First the idea, then the bench. Read the next few screens before touching a lead. When the practical part
            starts, the sockets and knobs to use are marked on the equipment, but you make every connection and
            adjustment yourself, exactly as in the practical exam. The guide tells you whether a step is done; it never
            moves on by itself.
          </Note>
        </>
      ),
    },
    {
      id: "why-modulate",
      kind: "theory",
      title: "Why we modulate at all",
      body: (
        <>
          <p>
            <strong>Communication</strong> means getting a message, such as a voice, from one place to another. The
            message is a <strong>low-frequency</strong> electrical signal: speech lies within a few kilohertz.
          </p>
          <p>
            Low frequencies are poorly suited to transmission. So we take a second, much higher-frequency sine wave,
            the <strong>carrier</strong>, and let the message change one of its properties. That is{" "}
            <strong>modulation</strong>: the carrier does the travelling, the message rides on it.
          </p>
          <Terms
            items={[
              ["Message", "The information. Low frequency. Also called the baseband signal. Here: a 2 kHz sine."],
              ["Carrier", "A pure high-frequency sine with no information of its own. Here: 100 kHz."],
              [
                "Modulation",
                "Changing a property of the carrier in step with the message. Change its amplitude and you have AM; change its frequency and you have FM.",
              ],
            ]}
          />
          <p>
            In the frequency domain, modulation <strong>moves</strong> the message from around 0 Hz up to around the
            carrier frequency, without changing the range of frequencies it occupies.
          </p>
        </>
      ),
      why: (
        <>
          <p>Three reasons you can give for moving the message up in frequency:</p>
          <ul>
            <li>
              <strong>Antennas.</strong> A practical antenna has to be a sizeable fraction of a wavelength. At 2 kHz the
              wavelength is 150 km. At 100 kHz it is 3 km, and at a real broadcast carrier of 1 MHz it is 300 m.
            </li>
            <li>
              <strong>Sharing.</strong> Every voice occupies the same low frequencies. Giving each transmitter its own
              carrier frequency puts each one in its own band, so they do not overlap.
            </li>
            <li>
              <strong>Separation.</strong> The carrier must be far above the message so the shifted copies of the
              spectrum do not overlap each other. In the lab explanation a rule of thumb of at least 10 times the
              message frequency was used. Here it is 50 times.
            </li>
          </ul>
        </>
      ),
      questions: ["i-why-modulate", "i-overlap", "r-am-vs-fm"],
    },
    {
      id: "equation",
      kind: "theory",
      title: "The AM equation",
      body: (
        <>
          <p>The lab sheet gives the whole experiment in one line:</p>
          <Eq label="AM equals open bracket message plus DC close bracket times carrier">
            AM = ( Message + DC ) × Carrier
          </Eq>
          <Figure caption="The carrier is drawn much slower than 100 kHz so that single cycles are visible.">
            <SignalsFigure />
          </Figure>
          <Terms
            items={[
              [
                "Message",
                <>
                  2 kHz sine, <strong>4 Vp-p</strong>. Peak-to-peak 4 V means it swings between +2 V and −2 V: its{" "}
                  <strong>peak amplitude is 2 V</strong>.
                </>,
              ],
              ["DC", "A constant voltage added to the message. It lifts the whole message up without changing its shape."],
              ["Carrier", "100 kHz sine, 4 Vp-p. It is multiplied by the lifted message."],
            ]}
          />
          <p>
            Read it as two actions in order: <strong>shift first, multiply second</strong>. That is why the bench needs
            exactly two modules: the <strong>Adder</strong> does the bracket, the <strong>Multiplier</strong> does the
            ×.
          </p>
        </>
      ),
      why: (
        <>
          <p>Multiplying out the bracket shows what is actually transmitted:</p>
          <Eq>
            ( <V>m</V> + <V>V</V>
            <sub>DC</sub> ) × <V>c</V> &nbsp;=&nbsp; <V>m</V> × <V>c</V> &nbsp;+&nbsp; <V>V</V>
            <sub>DC</sub> × <V>c</V>
          </Eq>
          <ul>
            <li>
              <V>V</V>
              <sub>DC</sub> × <V>c</V> is simply the carrier, scaled by the DC. <strong>The DC is what puts the carrier
              into the output.</strong>
            </li>
            <li>
              <V>m</V> × <V>c</V> is the part that carries the message. It becomes the two sidebands (a later screen).
            </li>
          </ul>
          <p>With the message written as a sine, the lab's signal is</p>
          <Eq>
            <V>s</V>(<V>t</V>) = [ <V>V</V>
            <sub>DC</sub> + <V>A</V>
            <sub>m</sub> cos(2π<V>f</V>
            <sub>m</sub>
            <V>t</V>) ] · <V>A</V>
            <sub>c</sub> cos(2π<V>f</V>
            <sub>c</sub>
            <V>t</V>)
          </Eq>
          <p>
            with <V>A</V>
            <sub>m</sub> = 2 V, <V>f</V>
            <sub>m</sub> = 2 kHz, <V>A</V>
            <sub>c</sub> = 2 V, <V>f</V>
            <sub>c</sub> = 100 kHz.
          </p>
        </>
      ),
      questions: ["i-model", "p-vpp"],
    },
    {
      id: "envelope",
      kind: "theory",
      title: "The DC shift and the envelope",
      body: (
        <>
          <p>
            Multiplying the carrier by a number changes its height. Multiply by 3 and the carrier is three times
            taller; multiply by 0 and it vanishes; multiply by a <strong>negative</strong> number and it turns
            upside-down.
          </p>
          <p>
            So the term (Message + DC) acts as a <strong>moving volume control</strong> on the carrier. The carrier's
            peaks trace out that term. The two lines through the peaks are the <strong>envelopes</strong>.
          </p>
          <Figure caption="Dashed: the envelopes. The upper one has the shape of the message; the lower one is the same shape upside-down.">
            <AmFigure dc={2.6} />
          </Figure>
          <p>
            Now the reason for the DC. The message alone swings from +2 V to −2 V, so half the time it is negative.
            Adding DC lifts it so that it <strong>stays above zero</strong>:
          </p>
          <Figure caption="2 V of DC lifts the 2 V-peak message so that its lowest point just reaches 0 V.">
            <ShiftFigure dc={2} />
          </Figure>
          <Note tone="key">
            As long as (Message + DC) never goes negative, the envelope is an exact copy of the message. That is the
            whole point of conventional AM: the receiver only has to follow the envelope.
          </Note>
        </>
      ),
      why: (
        <>
          <p>
            The shift changes only the message's <strong>vertical position</strong>. Its amplitude is still 4 Vp-p and
            its frequency is still 2 kHz.
          </p>
          <p>
            If the DC is too small, part of the message stays below zero. During that part the carrier is multiplied by
            a negative number and flips over. The upper and lower envelopes cross, and the outline of the waveform is
            no longer the message. You will produce exactly this in the last part of the experiment.
          </p>
        </>
      ),
      questions: ["i-why-dc", "m-envelopes", "i-zero-dc"],
    },
    {
      id: "depth",
      kind: "theory",
      title: "Modulation depth μ",
      body: (
        <>
          <p>
            The <strong>modulation index</strong> μ (the lab sheet calls it the modulation depth, <V>m</V>) says how
            deeply the message cuts into the carrier. It is one ratio:
          </p>
          <Eq label="mu equals message peak amplitude divided by DC level">
            μ = <Frac n={<>message peak amplitude</>} d={<>DC level</>} /> = <Frac n={<><V>A</V><sub>m</sub></>} d={<><V>V</V><sub>DC</sub></>} />
          </Eq>
          <p>
            Our message peak is fixed at 2 V, so <strong>the DC alone decides μ</strong>: more DC, smaller μ.
          </p>
          <Figure caption="The same 2 V-peak message with three DC levels, drawn to one voltage scale.">
            <DepthFigure />
          </Figure>
          <Terms
            items={[
              ["μ < 1", "Under-modulation. The envelope never reaches zero. It is a clean copy of the message."],
              ["μ = 1", "100% modulation. The envelope just touches zero at the message's lowest point."],
              [
                "μ > 1",
                "Over-modulation. The envelope crosses zero, the carrier flips phase, and the outline is no longer the message.",
              ],
            ]}
          />
        </>
      ),
      why: (
        <>
          <p>On the oscilloscope you cannot see the DC and the message separately, so μ is measured from the envelope:</p>
          <Eq label="mu equals P minus Q over P plus Q">
            μ = <Frac n="P − Q" d="P + Q" />
          </Eq>
          <p>
            <V>P</V> is the largest peak-to-peak height of the envelope and <V>Q</V> the smallest. The two formulas
            agree, because <V>P</V> is proportional to (<V>V</V>
            <sub>DC</sub> + <V>A</V>
            <sub>m</sub>) and <V>Q</V> to (<V>V</V>
            <sub>DC</sub> − <V>A</V>
            <sub>m</sub>). You will measure both in the last part.
          </p>
        </>
      ),
      questions: ["r-mu", "i-three-cases", "m-range"],
    },
    {
      id: "sidebands",
      kind: "theory",
      title: "Inside the AM signal: carrier and sidebands",
      body: (
        <>
          <p>
            The scope shows the signal against time. Described by frequency instead, the same signal turns out to be{" "}
            <strong>three sine waves added together</strong>:
          </p>
          <Figure caption="Spectrum of the lab's AM signal with 2 V of DC (μ = 1).">
            <SpectrumFigure />
          </Figure>
          <Terms
            items={[
              ["100 kHz", "The carrier itself. It comes from the DC term."],
              ["102 kHz", "Upper sideband: carrier + message frequency."],
              ["98 kHz", "Lower sideband: carrier − message frequency."],
            ]}
          />
          <p>
            Two sidebands, and the carrier sent in full: <strong>double-sideband, full carrier (DSB-FC)</strong>. This
            is ordinary AM.
          </p>
          <Note tone="exam">
            There is <strong>nothing at 2 kHz</strong> in the AM signal, even though its envelope has exactly the shape
            of the 2 kHz message. The message has been moved up: it now lives in the sidebands. The bandwidth is 102 −
            98 = <strong>4 kHz</strong>, twice the message frequency.
          </Note>
          <p>
            Take the DC away and the carrier line disappears while the sidebands stay. That signal is{" "}
            <strong>DSB-SC</strong> (suppressed carrier). You will meet it again at the end.
          </p>
        </>
      ),
      why: (
        <>
          <p>The sidebands come from multiplying two cosines. The product of two cosines is a sum and a difference:</p>
          <Eq>
            cos <V>a</V> · cos <V>b</V> = ½ cos(<V>a</V> + <V>b</V>) + ½ cos(<V>a</V> − <V>b</V>)
          </Eq>
          <p>So message × carrier gives one line at 100 + 2 kHz and one at 100 − 2 kHz, each at half amplitude.</p>
          <p>
            More generally, multiplying by a cosine <strong>shifts the whole spectrum</strong> of the message to be
            centred on the carrier frequency. A message made of many frequencies, like speech, gives two whole bands
            instead of two lines.
          </p>
          <Note tone="hardware">
            The trainer makes its &quot;2 kHz&quot; by dividing the 100 kHz clock by 48, so it is really 2.083 kHz and
            the sidebands sit at 97.9 and 102.1 kHz. Use the nominal 2 kHz, 98 kHz and 102 kHz in your answers.
          </Note>
        </>
      ),
      questions: ["i-frequencies", "m-no-message-line", "i-multiply-spectrum", "p-amp-bandwidth"],
    },
  ],
};

const prepare: Section = {
  id: "message",
  title: "A · Prepare the message",
  steps: [
    {
      id: "a-intro",
      kind: "theory",
      title: "Part A: a clean 4 Vp-p message",
      body: (
        <>
          <p>
            Everything later depends on knowing the message amplitude exactly, because μ = message peak ÷ DC. So the
            first job is to get a 2 kHz sine of <strong>exactly 4 Vp-p</strong> at the Adder output.
          </p>
          <Figure caption="Part A builds the solid blocks only.">
            <BlockDiagram stage={1} />
          </Figure>
          <p>You will:</p>
          <ol>
            <li>Feed the 2 kHz sine into Adder input A.</li>
            <li>Hold input B at 0 V by grounding it.</li>
            <li>Look at the Adder output on CH1.</li>
            <li>Trim the Adder&apos;s G gain until the output reads 4 Vp-p.</li>
          </ol>
          <Note tone="hardware">
            Leads are 2 mm patch leads. Pick a colour in the toolbar on the left, then drag from one socket to the
            other, or click one and then the other. Colour has no electrical meaning.
          </Note>
        </>
      ),
    },
    {
      id: "a-message",
      kind: "connect",
      title: "Connect the 2 kHz SINE to Adder input A",
      highlight: { link: [MESSAGE, ADDER_A] },
      body: (
        <p>
          Find <strong>2kHz SINE</strong>, the bottom socket of the MASTER SIGNALS module, and run a lead to socket{" "}
          <strong>A</strong> of the ADDER.
        </p>
      ),
      why: (
        <>
          <p>
            MASTER SIGNALS is the trainer&apos;s signal source. Its 2 kHz sine is our message: a single tone standing
            in for speech, because a single tone is easy to recognise and measure.
          </p>
          <p>
            Input A is the Adder input whose gain is set by the upper trimmer, <strong>G</strong>. The Adder output is
            G × A + g × B (inverted, see the next steps).
          </p>
        </>
      ),
      checks: [{ label: "2 kHz SINE reaches Adder input A", test: messageWired }],
    },
    {
      id: "a-ground-b",
      kind: "connect",
      title: "Ground Adder input B",
      highlight: { link: [ADDER_B, "gnd.left"] },
      body: (
        <p>
          Run a lead from Adder input <strong>B</strong> to a <strong>GND</strong> socket. Any GND socket on the trainer
          is the same point.
        </p>
      ),
      why: (
        <>
          <p>
            The Adder output is the sum of both inputs. For now we want the message <strong>alone</strong>, so B must
            contribute exactly 0 V.
          </p>
          <p>
            An input left open is not a guaranteed 0 V. On real hardware it can float and pick up noise, which would be
            added to the message. Grounding it removes the doubt, so that what you measure is G × A and nothing else.
          </p>
        </>
      ),
      checks: [{ label: "Adder input B is at ground", test: (b) => ({ ok: b.grounded(ADDER_B) }) }],
    },
    {
      id: "a-scope",
      kind: "connect",
      title: "Connect the Adder output to CH1",
      highlight: { link: [ADDER_OUT, CH1] },
      body: (
        <p>
          Run a lead from the Adder output, the socket marked <strong>GA+gB</strong>, to the <strong>red</strong> node
          of oscilloscope input <strong>CH1</strong>.
        </p>
      ),
      why: (
        <p>
          The red node is the signal conductor of the CH1 input (the centre pin of its BNC connector). This is where the
          tip of the scope probe would go on the real bench.
        </p>
      ),
      checks: [{ label: "Adder output reaches the CH1 red node", test: (b) => ({ ok: b.linked(ADDER_OUT, CH1) }) }],
    },
    {
      id: "a-scope-ground",
      kind: "connect",
      title: "Connect the oscilloscope ground",
      highlight: { link: ["scope.ch1.gnd", "gnd.right"] },
      body: (
        <>
          <p>
            Run a lead from the <strong>black</strong> node of CH1 to a <strong>GND</strong> socket on the trainer.
          </p>
          <p>Until this lead is in place the bench reports &quot;no ground reference&quot; and the trace is not valid.</p>
        </>
      ),
      why: (
        <>
          <p>
            A voltage is always measured <strong>between two points</strong>. The oscilloscope measures between its red
            node and its own ground. If its ground is not tied to the trainer&apos;s ground, the two instruments have no
            common reference and the reading means nothing.
          </p>
          <p>
            On the real bench this is the black clip of the scope lead. The lab sheet does not list it as a step because
            the lead has both clips, but forgetting the black clip is a classic practical-exam mistake.
          </p>
          <p>One ground lead is enough for both channels: the black nodes are joined inside the oscilloscope.</p>
        </>
      ),
      checks: [{ label: "Oscilloscope and trainer share a ground", test: (b) => ({ ok: b.scopeGrounded }) }],
    },
    {
      id: "a-display",
      kind: "adjust",
      title: "Set up the oscilloscope",
      highlight: { controls: ["MODE", "CH1 VOLTS/DIV", "TIME/DIV", "CH1 coupling", "CH1 POSITION", "TRIGGER SOURCE", "INT TRIGGER"] },
      body: (
        <>
          <p>Set the marked controls. Click a knob to open its slider; click a switch position to select it.</p>
          <Settings
            rows={[
              ["MODE", "CH1"],
              ["CH1 VOLTS/DIV", "1 V"],
              ["CH1 coupling", "DC"],
              ["TIME/DIV", "0.2 ms"],
              ["Trigger", "INT, source CH1"],
            ]}
          />
          <p>
            Then put 0 V on the centre line: switch CH1 coupling to <strong>GND</strong>, use <strong>CH1 POSITION</strong>{" "}
            to bring the flat line onto the centre graticule line, and switch back to <strong>DC</strong>.
          </p>
        </>
      ),
      why: (
        <>
          <ul>
            <li>
              <strong>1 V/div</strong>: a 4 Vp-p signal is then 4 divisions tall, easy to read on the 8-division
              screen.
            </li>
            <li>
              <strong>0.2 ms/div</strong>: one cycle of 2 kHz lasts 0.5 ms, so about two and a half divisions per cycle
              and four cycles across the screen.
            </li>
            <li>
              <strong>DC coupling</strong>: shows the signal as it is, including any DC level. You will need that in
              Part B.
            </li>
            <li>
              <strong>GND position</strong>: the GND setting disconnects the signal and shows where 0 V is drawn. An
              analogue scope has no readout, so you place the zero line yourself before measuring a DC level.
            </li>
          </ul>
        </>
      ),
      checks: [
        { label: "CH1 is displayed", test: scopeShows("ch1") },
        {
          label: "CH1 is on DC coupling",
          test: (b) => ({ ok: b.controls.scope.ch1.coupling === "dc", detail: `Coupling is ${b.controls.scope.ch1.coupling.toUpperCase()}` }),
        },
        { label: "The trace is steady", test: steady },
      ],
    },
    {
      id: "a-calibrate",
      kind: "adjust",
      title: "Set the message to 4 Vp-p",
      highlight: { controls: ["ADDER G"], ports: [ADDER_OUT] },
      body: (
        <>
          <p>
            Turn the Adder&apos;s <strong>G</strong> trimmer (the upper one) until the sine on the screen is{" "}
            <strong>exactly 4 divisions</strong> from its lowest to its highest point. At 1 V/div that is 4 Vp-p.
          </p>
          <Note tone="scope">
            Count from the bottom of the wave to the top, not from the centre line. Use CH1 POSITION to rest the bottom
            of the wave on a graticule line, then count up. Each small tick on the centre line is 0.2 of a division.
          </Note>
          <p>For practice, turn G well away from its setting first and bring it back using only the screen.</p>
        </>
      ),
      why: (
        <>
          <p>
            <strong>Peak-to-peak</strong> (Vp-p) is the full height of the wave, from its most negative to its most
            positive point. A 4 Vp-p sine swings ±2 V, so its <strong>peak amplitude is 2 V</strong>. That 2 V is the{" "}
            <V>A</V>
            <sub>m</sub> in μ = <V>A</V>
            <sub>m</sub> / <V>V</V>
            <sub>DC</sub>.
          </p>
          <p>
            Calibrating matters because every later result assumes it. If the message were 3 Vp-p instead of 4, then 2 V
            of DC would not give μ = 1 and none of your three cases would match the theory.
          </p>
          <p>
            G only changes the gain of input A. It does not change the frequency, and it does not affect input B.
          </p>
        </>
      ),
      checks: [{ label: "Adder output is 4 Vp-p", test: messageLevel }],
      questions: ["p-ground-b", "p-vpp"],
    },
  ],
};

const offset: Section = {
  id: "dc",
  title: "B · Add the DC offset",
  steps: [
    {
      id: "b-intro",
      kind: "theory",
      title: "Part B: lift the message",
      body: (
        <>
          <p>
            Now build the bracket of the equation: <strong>(Message + DC)</strong>. Input B stops being 0 V and gets a
            DC voltage from the VARIABLE DCV module instead.
          </p>
          <Figure caption="Part B adds the Variable DCV on input B.">
            <BlockDiagram stage={2} />
          </Figure>
          <p>
            On the screen you should see the <strong>same sine, moved vertically</strong>. Same height, same frequency,
            new position.
          </p>
        </>
      ),
    },
    {
      id: "b-unground",
      kind: "connect",
      title: "Remove the ground lead from input B",
      highlight: { ports: [ADDER_B] },
      body: (
        <>
          <p>
            Take away the lead between Adder input <strong>B</strong> and GND.
          </p>
          <p>
            To remove a lead: choose the Remove tool in the toolbar and click the lead, or click the lead and press
            Delete.
          </p>
        </>
      ),
      why: (
        <p>
          Input B is about to be driven by the VDC output. If it were still joined to GND, you would be connecting the
          VDC output straight to ground: a short circuit, and B would stay at 0 V. Always remove the ground first.
        </p>
      ),
      checks: [{ label: "Input B is no longer grounded", test: (b) => ({ ok: !b.grounded(ADDER_B) }) }],
    },
    {
      id: "b-vdc",
      kind: "connect",
      title: "Connect VDC to Adder input B",
      highlight: { link: [VDC, ADDER_B] },
      body: (
        <p>
          Run a lead from the <strong>VDC</strong> socket of the VARIABLE DCV module to Adder input <strong>B</strong>.
        </p>
      ),
      why: (
        <p>
          VDC is an adjustable DC voltage, set by the VDC knob of the same module, from −2.5 V to +2.5 V. (The +5V
          socket above it is a fixed supply and is not used here.) The Adder now outputs the message plus that DC, each
          scaled by its own gain.
        </p>
      ),
      checks: [
        {
          label: "VDC reaches Adder input B",
          test: (b) => ({
            ok: b.linked(VDC, ADDER_B) && !b.grounded(ADDER_B),
            detail: b.linked(VDC, ADDER_B) && b.grounded(ADDER_B) ? "B is still joined to GND, which shorts VDC to ground." : undefined,
          }),
        },
      ],
    },
    {
      id: "b-shift",
      kind: "adjust",
      title: "Shift the message by 2 V",
      highlight: { controls: ["VDC", "CH1 VOLTS/DIV"], ports: [ADDER_OUT] },
      body: (
        <>
          <p>
            Turn the <strong>VDC</strong> knob and watch the whole sine move up or down. Stop when it has moved{" "}
            <strong>2 divisions</strong> from where it started (2 V at 1 V/div).
          </p>
          <Note tone="hardware">
            The ETT-101 Adder inverts. A <strong>negative</strong> VDC moves the trace <strong>up</strong>, and a
            positive VDC moves it down. Either direction is fine: what matters is the size of the shift, 2 V.
          </Note>
          <p>
            If the top of the wave leaves the screen, switch CH1 to 2 V/div. The shift is then 1 division.
          </p>
        </>
      ),
      why: (
        <>
          <p>
            2 V is not arbitrary. The message peak is 2 V, so 2 V of DC lifts its lowest point exactly to 0 V. That is
            μ = 2 / 2 = 1, the boundary case you will see first when the carrier is added.
          </p>
          <p>
            <strong>What changed:</strong> only the vertical position. <strong>What did not:</strong> the amplitude
            (still 4 Vp-p) and the frequency (still 2 kHz). Adding a constant cannot change either.
          </p>
          <p>
            The DC that counts is the level <strong>at the Adder output</strong>, which is g × VDC. The lower trimmer,
            g, is the gain of input B. With g at ×1 the output DC equals VDC.
          </p>
        </>
      ),
      checks: [{ label: "DC level at the Adder output is 2 V, message still 4 Vp-p", test: dcLevel(2, 0.1) }],
    },
    {
      id: "b-observe",
      kind: "observe",
      title: "Observe: the shifted message",
      highlight: { controls: ["CH1 coupling"] },
      body: (
        <>
          <Figure caption="What CH1 should show: the same 4 Vp-p sine, now sitting 2 V away from the zero line.">
            <ShiftFigure dc={2} />
          </Figure>
          <p>
            Try one thing: switch <strong>CH1 coupling</strong> from DC to <strong>AC</strong>. The wave drops back to
            the centre as if no DC had been added. Switch back to DC before you continue.
          </p>
          <Note tone="scope">
            AC coupling puts a capacitor in series with the input, and a capacitor blocks DC. To see or measure a DC
            level the channel must be on DC coupling.
          </Note>
          <p>Record this picture: the lab sheet asks for the shifted signal in your report.</p>
        </>
      ),
      questions: ["i-dc-change", "p-ac-coupling", "p-inverting"],
    },
  ],
};

const modulate: Section = {
  id: "am",
  title: "C · Generate the AM signal",
  steps: [
    {
      id: "c-intro",
      kind: "theory",
      title: "Part C: multiply by the carrier",
      body: (
        <>
          <p>
            The bracket is ready. Now the multiplication: the shifted message goes to one input of a Multiplier and the
            100 kHz carrier to the other.
          </p>
          <Figure caption="Part C completes the transmitter.">
            <BlockDiagram stage={3} />
          </Figure>
          <p>
            The message stays on CH1 and the AM signal goes to CH2, so the two can be compared, exactly as in the lab
            sheet.
          </p>
          <Note tone="hardware">
            The trainer has three Multipliers. The lab sheet&apos;s figure uses the one with sockets{" "}
            <strong>X DC</strong>, <strong>Y DC</strong> and <strong>kXY</strong>, below the first Multiplier. That is
            the one marked here.
          </Note>
        </>
      ),
    },
    {
      id: "c-x",
      kind: "connect",
      title: "Connect the Adder output to Multiplier X DC",
      highlight: { link: [ADDER_OUT, "mult2.x"] },
      body: (
        <>
          <p>
            Run a second lead from the Adder output (<strong>GA+gB</strong>) to the Multiplier&apos;s{" "}
            <strong>X DC</strong> input.
          </p>
          <p>The Adder output now has two leads: one to CH1, one to the Multiplier. Sockets accept more than one lead.</p>
        </>
      ),
      why: (
        <>
          <p>
            The input must be a <strong>DC</strong> input. The upper Multiplier also has AC inputs, which pass the
            signal through a capacitor. A capacitor blocks DC, so an AC input would throw away the very DC level you
            just added. With no DC there is no carrier term, and the output would be DSB-SC instead of AM.
          </p>
        </>
      ),
      checks: [
        {
          label: "Adder output reaches a Multiplier DC input",
          test: (b) => ({
            ok: MULTIPLIERS.some((m) => b.linked(ADDER_OUT, m.x) || b.linked(ADDER_OUT, m.y)),
            detail:
              b.linked(ADDER_OUT, "mult1.xac") || b.linked(ADDER_OUT, "mult1.yac")
                ? "That is an AC input: it blocks the DC you added. Use a DC input."
                : undefined,
          }),
        },
      ],
    },
    {
      id: "c-y",
      kind: "connect",
      title: "Connect the 100 kHz SINE to Multiplier Y DC",
      highlight: { link: [CARRIER, "mult2.y"] },
      body: (
        <p>
          Run a lead from <strong>100kHz SINE</strong>, the top socket of MASTER SIGNALS, to the <strong>Y DC</strong>{" "}
          input of the same Multiplier.
        </p>
      ),
      why: (
        <>
          <p>
            This is the carrier: 100 kHz, 4 Vp-p. It is 50 times faster than the message, comfortably more than the
            ten-times rule of thumb.
          </p>
          <p>
            Use the <strong>SINE</strong> socket, not 100kHz COS (same wave, a quarter-cycle later) and not 100kHz
            DIGITAL (a 0 to 5 V square wave). X and Y are interchangeable: a multiplier does not care which input is
            which.
          </p>
        </>
      ),
      checks: [
        {
          label: "Shifted message and 100 kHz carrier are on the same Multiplier",
          test: (b) => ({ ok: modulator(b) !== null }),
        },
      ],
    },
    {
      id: "c-out",
      kind: "connect",
      title: "Connect the Multiplier output to CH2",
      highlight: { link: ["mult2.out", CH2] },
      body: (
        <p>
          Run a lead from the Multiplier output, <strong>kXY</strong>, to the <strong>red</strong> node of oscilloscope
          input <strong>CH2</strong>.
        </p>
      ),
      why: (
        <p>
          kXY means k × X × Y: the product of the two inputs times a fixed gain k of the module (about 1). No extra
          ground lead is needed for CH2. Both channels use the oscilloscope&apos;s one ground, which you connected in
          Part A.
        </p>
      ),
      checks: [
        {
          label: "Multiplier output reaches the CH2 red node",
          test: (b) => {
            const mod = modulator(b);
            return { ok: MULTIPLIERS.some((m) => b.linked(m.out, CH2) && (!mod || mod.out === m.out)) };
          },
        },
      ],
    },
    {
      id: "c-display",
      kind: "adjust",
      title: "Display the AM signal",
      highlight: { controls: ["MODE", "CH2 VOLTS/DIV", "CH2 POSITION", "CH2 coupling", "INT TRIGGER", "TIME/DIV"] },
      body: (
        <>
          <Settings
            rows={[
              ["MODE", "DUAL to compare, CH2 to measure"],
              ["CH2 VOLTS/DIV", "5 V (then 2 V if it fits)"],
              ["CH2 coupling", "DC"],
              ["TIME/DIV", "0.2 ms"],
              ["Trigger", "INT, source CH1"],
            ]}
          />
          <p>
            Use <strong>CH2 POSITION</strong> to centre the AM signal. In DUAL mode, move the message to the upper half
            with CH1 POSITION so the two do not overlap.
          </p>
        </>
      ),
      why: (
        <>
          <p>
            <strong>Trigger on CH1, the message.</strong> The message crosses the trigger level once per cycle, so every
            sweep starts at the same point of the envelope and the picture stands still. The AM signal itself crosses
            any level about fifty times per message cycle, so triggering on it makes the envelope jitter.
          </p>
          <p>
            <strong>Why it looks filled in.</strong> At 0.2 ms/div each division holds 20 carrier cycles. They are too
            close to separate, so the trace looks like a solid band whose edges are the envelopes. That is correct, and
            it is what the real scope shows.
          </p>
          <p>
            <strong>Why 5 V/div.</strong> The multiplier output is large: with 2 V of DC it reaches about ±8 V, 16
            Vp-p.
          </p>
        </>
      ),
      checks: [
        { label: "CH2 is displayed", test: scopeShows("ch2") },
        { label: "The scope triggers on the message (CH1)", test: triggerOnMessage },
        {
          label: "An AM signal is present at the Multiplier output",
          test: (b) => {
            const e = envelope(b);
            return e ? { ok: e.P > 0.5, detail: describeEnvelope(e) } : { ok: false, detail: "No multiplier has both the shifted message and the carrier." };
          },
        },
      ],
    },
    {
      id: "c-observe",
      kind: "observe",
      title: "Observe: the AM envelope",
      highlight: { controls: ["TIME/DIV"] },
      body: (
        <>
          <Figure caption="With 2 V of DC: the envelope has the shape of the message and just touches zero.">
            <AmFigure dc={2} />
          </Figure>
          <p>Compare CH2 with the message on CH1:</p>
          <ul>
            <li>
              The <strong>upper edge</strong> of the AM signal rises and falls in step with the message. The lower edge
              is its mirror image.
            </li>
            <li>The envelope repeats at the message rate: one cycle every 0.5 ms.</li>
            <li>With the DC still at 2 V, the envelope pinches down to zero once per cycle. This is μ = 1.</li>
          </ul>
          <p>
            Now turn <strong>TIME/DIV</strong> to <strong>5 µs</strong>. The band opens up into individual 100 kHz
            carrier cycles, each 10 µs long. Return to 0.2 ms.
          </p>
          <Note tone="hardware">
            If your DC shift went downwards, the widest part of the envelope lines up with the lowest point of CH1
            instead of the highest. That is only the sign of the DC at the Adder output: the envelope shape and μ are
            the same either way.
          </Note>
        </>
      ),
      why: (
        <>
          <p>
            Multiplication is why the message appears in the envelope. At every instant the carrier is scaled by the
            current value of (Message + DC). When that value is large the carrier is tall; when it is small the carrier
            is short. Joining the carrier&apos;s peaks therefore redraws (Message + DC).
          </p>
          <p>
            Notice what you do <strong>not</strong> see: a 2 kHz sine wave. The AM signal is a 100 kHz wave whose height
            changes. Its average over a cycle is zero. The message is in the height, not in the signal itself, which is
            why the spectrum has no line at 2 kHz.
          </p>
        </>
      ),
      questions: ["p-trigger", "p-time-scales", "p-envelope-no-line"],
    },
  ],
};

const depthSection: Section = {
  id: "depth",
  title: "D · Investigate modulation depth",
  steps: [
    {
      id: "d-measure",
      kind: "theory",
      title: "Part D: measuring μ with P and Q",
      body: (
        <>
          <p>
            You will set three DC levels and, for each, read two heights off the screen. Set MODE to <strong>CH2</strong>{" "}
            so only the AM signal is shown.
          </p>
          <Figure caption="P: tallest part of the envelope, top to bottom. Q: narrowest part, top to bottom.">
            <AmFigure dc={4} showPQ />
          </Figure>
          <Eq label="mu equals P minus Q over P plus Q">
            μ = <Frac n="P − Q" d="P + Q" />
          </Eq>
          <ul>
            <li>
              <V>P</V> and <V>Q</V> are both <strong>peak-to-peak</strong> heights, from the upper envelope to the lower
              envelope.
            </li>
            <li>
              Count them in divisions. No need to convert to volts: only the ratio matters, as long as both are read on
              the same VOLTS/DIV setting.
            </li>
          </ul>
          <Note tone="caution" title="Q can be negative">
            When the signal is over-modulated the envelope crosses zero, and the narrow part becomes a small extra
            lobe. That lobe is the envelope on the <strong>other side of zero</strong>, so its height is entered as a{" "}
            <strong>negative</strong> Q.
          </Note>
        </>
      ),
      why: (
        <>
          <p>Where the formula comes from. With carrier peak amplitude <V>A</V><sub>c</sub>:</p>
          <Eq>
            <V>P</V> = 2<V>A</V>
            <sub>c</sub> ( <V>V</V>
            <sub>DC</sub> + <V>A</V>
            <sub>m</sub> ) &nbsp;&nbsp; <V>Q</V> = 2<V>A</V>
            <sub>c</sub> ( <V>V</V>
            <sub>DC</sub> − <V>A</V>
            <sub>m</sub> )
          </Eq>
          <p>
            Subtracting gives <V>P</V> − <V>Q</V> = 4<V>A</V>
            <sub>c</sub>
            <V>A</V>
            <sub>m</sub>; adding gives <V>P</V> + <V>Q</V> = 4<V>A</V>
            <sub>c</sub>
            <V>V</V>
            <sub>DC</sub>. Divide, and the carrier amplitude cancels:
          </p>
          <Eq>
            <Frac n="P − Q" d="P + Q" /> = <Frac n={<><V>A</V><sub>m</sub></>} d={<><V>V</V><sub>DC</sub></>} /> = μ
          </Eq>
          <p>
            This also shows why Q must be signed: when <V>A</V>
            <sub>m</sub> is larger than <V>V</V>
            <sub>DC</sub>, the expression for Q really is negative.
          </p>
        </>
      ),
    },
    {
      id: "d-under",
      kind: "adjust",
      title: "DC = 4 V: under-modulation, μ = 0.5",
      highlight: { controls: ["VDC", "ADDER g", "CH2 VOLTS/DIV"] },
      body: (
        <>
          <p>
            Raise the DC at the Adder output to <strong>4 V</strong>. The VDC knob alone stops at 2.5 V, so use the
            Adder&apos;s <strong>g</strong> trimmer (the lower one, gain of input B) as well:
          </p>
          <ol>
            <li>Turn VDC to its end stop, 2.5 V (the same direction as before).</li>
            <li>Turn g up until the message on CH1 has shifted 4 V in total. Use 2 V/div on CH1: 2 divisions.</li>
          </ol>
          <p>
            Set CH2 to <strong>5 V/div</strong> and measure P and Q on the AM signal.
          </p>
          <Eq>
            μ = <Frac n="2 V" d="4 V" /> = 0.5
          </Eq>
        </>
      ),
      why: (
        <>
          <p>
            The DC is now twice the message peak. (Message + DC) swings between 2 V and 6 V and never comes near zero.
            The envelope ripples gently around a large carrier and is a clean copy of the message.
          </p>
          <p>
            Expected: <V>P</V> = 24 V and <V>Q</V> = 8 V, so (24 − 8) / (24 + 8) = 0.5. At 5 V/div that is 4.8 and 1.6
            divisions.
          </p>
          <p>
            Notice that the signal is <strong>larger</strong> than before, although it is less deeply modulated. μ is a
            ratio, not a size.
          </p>
          <p>Do not touch G: the message must stay at 4 Vp-p.</p>
        </>
      ),
      checks: [
        { label: "DC level at the Adder output is 4 V, message still 4 Vp-p", test: dcLevel(4, 0.2) },
        { label: "Modulation index measures 0.5", test: depth(0.5, 0.03) },
      ],
    },
    {
      id: "d-full",
      kind: "adjust",
      title: "DC = 2 V: 100% modulation, μ = 1",
      highlight: { controls: ["VDC", "ADDER g", "CH2 VOLTS/DIV"] },
      body: (
        <>
          <p>
            Bring the DC at the Adder output back down to <strong>2 V</strong>, with VDC, g or both. Watch the narrow
            part of the envelope close until it <strong>just touches</strong>.
          </p>
          <Eq>
            μ = <Frac n="2 V" d="2 V" /> = 1
          </Eq>
          <Figure caption="μ = 1: the envelope reaches zero once per message cycle, so Q = 0.">
            <AmFigure dc={2} />
          </Figure>
        </>
      ),
      why: (
        <>
          <p>
            The DC equals the message peak, so the lowest point of (Message + DC) is exactly 0 V. At that instant the
            carrier is multiplied by zero.
          </p>
          <p>
            Expected: <V>P</V> = 16 V, <V>Q</V> = 0, so (16 − 0) / (16 + 0) = 1.
          </p>
          <p>
            This is the deepest modulation without distortion, and also the edge of a cliff: the slightest further
            reduction of the DC, or increase of the message, tips it into over-modulation. Try it: the smallest touch on
            VDC opens or crosses the gap.
          </p>
        </>
      ),
      checks: [
        { label: "DC level at the Adder output is 2 V, message still 4 Vp-p", test: dcLevel(2, 0.08) },
        { label: "Modulation index measures 1", test: depth(1, 0.04) },
      ],
    },
    {
      id: "d-over",
      kind: "adjust",
      title: "DC = 1 V: over-modulation, μ = 2",
      highlight: { controls: ["VDC", "ADDER g", "CH2 VOLTS/DIV"] },
      body: (
        <>
          <p>
            Lower the DC at the Adder output to <strong>1 V</strong>. Small extra lobes appear between the main ones.
            Set CH2 to 2 V/div to see them clearly.
          </p>
          <Eq>
            μ = <Frac n="2 V" d="1 V" /> = 2
          </Eq>
          <Figure caption="μ = 2. Q is the height of the small lobe, entered as a negative number.">
            <AmFigure dc={1} showPQ />
          </Figure>
          <p>
            Measure <V>P</V> on a large lobe and <V>Q</V> on a small one, and enter Q as negative.
          </p>
        </>
      ),
      why: (
        <>
          <p>
            The DC is now smaller than the message peak. (Message + DC) swings between +3 V and −1 V: for part of every
            cycle it is <strong>negative</strong>. During that part the carrier is multiplied by a negative number and
            turns upside-down. This is the <strong>phase reversal</strong>, and the small lobe is that negative part.
          </p>
          <p>
            Expected: <V>P</V> = 12 V, <V>Q</V> = −4 V:
          </p>
          <Eq>
            μ = <Frac n="12 − (−4)" d="12 + (−4)" /> = <Frac n="16" d="8" /> = 2
          </Eq>
          <p>
            Entering +4 instead would give 8 / 16 = 0.5: the formula would report under-modulation for a signal that
            is clearly distorted.
          </p>
          <p>
            The outline of the waveform is no longer the message. An envelope detector follows the outline, so it
            would output the folded shape, not the sine that was sent.
          </p>
        </>
      ),
      checks: [
        { label: "DC level at the Adder output is 1 V, message still 4 Vp-p", test: dcLevel(1, 0.06) },
        { label: "Modulation index measures 2", test: depth(2, 0.12) },
      ],
    },
    {
      id: "d-conclude",
      kind: "observe",
      title: "What the three cases show",
      body: (
        <>
          <Figure>
            <DepthFigure />
          </Figure>
          <ul>
            <li>
              <strong>Lowering the DC raises μ.</strong> The message did not change at all; only its distance from zero
              did.
            </li>
            <li>
              For <strong>μ ≤ 1</strong> the envelope is the message. For <strong>μ &gt; 1</strong> it is not: the
              signal is <strong>distorted</strong>.
            </li>
            <li>
              In practice we work with <strong>μ below 1</strong>. μ = 1 is the theoretical limit, with no margin for
              noise, drift or a slightly larger message.
            </li>
          </ul>
          <Note tone="scope" title="Worked examples from a real lab session">
            Under-modulated: P = 4.8, Q = 0.8, so μ = (4.8 − 0.8) / (4.8 + 0.8) = 4 / 5.6 ≈ 0.7.
            <br />
            Over-modulated: P = 3.2, Q = −0.8, so μ = (3.2 + 0.8) / (3.2 − 0.8) = 4 / 2.4 ≈ 1.67.
            <br />
            Real readings rarely land on round numbers; what matters is reading P and Q correctly and using the signed
            Q.
          </Note>
        </>
      ),
      why: (
        <>
          <p>
            &quot;Distorted&quot; has a precise meaning here: the envelope no longer has the same shape as the message,
            so the receiver cannot get the original message back by following the envelope.
          </p>
          <p>
            You can change μ in two ways. Changing the DC changes the size of the carrier and leaves the sidebands
            alone. Changing the message gain G changes the sidebands and leaves the carrier alone. Either way, only the
            ratio decides the depth.
          </p>
        </>
      ),
      questions: ["i-overmod", "i-mu-one", "m-calc", "p-signed-q", "m-distorted", "i-envelope-fails", "p-ratio-not-size", "p-gain-vs-dc"],
    },
  ],
};

const wrapUp: Section = {
  id: "summary",
  title: "E · Final observations",
  steps: [
    {
      id: "e-summary",
      kind: "summary",
      title: "What the experiment established",
      body: (
        <>
          <p>You generated a real AM signal from its mathematical model, and every part of the model was visible:</p>
          <Terms
            items={[
              ["Message", "2 kHz, 2 V peak. It sets the shape of the envelope, and its frequency sets the bandwidth (2 × 2 kHz = 4 kHz)."],
              ["DC offset", "Lifts the message away from zero and becomes the carrier in the output. More DC: larger carrier, smaller μ."],
              ["Carrier", "100 kHz. It decides where in the spectrum the signal sits. It carries no information itself."],
              ["Modulation index", "μ = message peak ÷ DC = (P − Q) ÷ (P + Q). Below 1: clean. Equal to 1: the limit. Above 1: distorted."],
              ["Sidebands", "At 98 and 102 kHz. They are the message, moved up to the carrier. Their size depends on the message amplitude, not on the DC."],
            ]}
          />
          <Figure caption="DSB-FC: both sidebands and the full carrier. Nothing at 2 kHz.">
            <SpectrumFigure />
          </Figure>
          <Note tone="exam" title="A 30-second answer">
            We generated a double-sideband full-carrier AM signal by adding a DC level to a 2 kHz message and
            multiplying the result by a 100 kHz carrier. The envelope of the output follows the message. The modulation
            index is the message peak divided by the DC: with a 2 V peak message, 4 V of DC gave 0.5, 2 V gave 1 and 1 V
            gave 2. Up to 1 the envelope is a copy of the message; above 1 the carrier reverses phase and the envelope
            is distorted, so in practice the index is kept below 1.
          </Note>
        </>
      ),
      why: (
        <>
          <p>
            <strong>Where the power goes.</strong> The carrier line is the tallest and is there all the time, yet it
            never changes with the message. For a sine message the sidebands hold a fraction μ² / (2 + μ²) of the
            power: one third at μ = 1, about 11% at μ = 0.5. Lowering μ for safety makes the efficiency worse. This
            is the weakness of full-carrier AM, and the reason to ask what happens without the carrier.
          </p>
          <p>
            <strong>The MATLAB listing in the lab sheet</strong> uses different numbers on purpose (carrier 600 Hz,
            message 20 Hz, Ec = 20, Em = 5). There Ec plays the part of the DC, so μ = 5 / 20 = 0.25, and the spectrum
            shows 580, 600 and 620 Hz. Same model, different values: do not mix them with the trainer&apos;s 2 kHz and
            100 kHz.
          </p>
        </>
      ),
      questions: ["i-carrier-power", "p-power-fraction", "p-both-double", "p-fc-doubles", "p-fm-doubles", "m-matlab"],
    },
    {
      id: "e-dsbsc",
      kind: "theory",
      title: "Without the carrier: DSB-SC",
      body: (
        <>
          <p>
            Set the DC to zero in the equation and the carrier term disappears. What is left is{" "}
            <strong>Message × Carrier</strong>: double-sideband <strong>suppressed carrier</strong>.
          </p>
          <Figure caption="DSB-SC spectrum: the same two sidebands, the same 4 kHz bandwidth, no carrier.">
            <SpectrumFigure carrier={false} />
          </Figure>
          <Figure caption="DSB-SC against time. The carrier flips at every zero crossing of the message (marked), so the outline is not the message.">
            <DsbscFigure />
          </Figure>
          <Terms
            items={[
              ["Gain", "All the transmitted power is in the sidebands, the part that carries the message."],
              [
                "Cost",
                "The outline is |message|, so an envelope detector no longer works. The receiver must multiply by its own carrier, synchronised in frequency and phase with the transmitter's, and then low-pass filter: coherent detection.",
              ],
            ]}
          />
          <p>
            You can see it on the bench: turn VDC to 0 V. The envelope becomes a row of equal lobes. Restore the DC
            afterwards.
          </p>
        </>
      ),
      why: (
        <>
          <p>
            <strong>Coherent detection.</strong> Multiply the received signal by the carrier again:
          </p>
          <Eq>
            <V>m</V>(<V>t</V>) cos²(2π<V>f</V>
            <sub>c</sub>
            <V>t</V>) = ½ <V>m</V>(<V>t</V>) + ½ <V>m</V>(<V>t</V>) cos(4π<V>f</V>
            <sub>c</sub>
            <V>t</V>)
          </Eq>
          <p>
            The first term is the message at half size. The second is a copy around twice the carrier frequency, which
            a low-pass filter removes. An amplifier restores the size if needed.
          </p>
          <p>
            <strong>Why synchronisation matters.</strong> If the receiver&apos;s carrier has a phase error φ, the
            recovered message is multiplied by cos φ:
          </p>
          <ul>
            <li>φ = 0°: full output.</li>
            <li>φ ≈ 70°: badly attenuated (cos 70° ≈ 0.34).</li>
            <li>φ = 90°: nothing at all.</li>
          </ul>
          <p>
            If the frequency is slightly wrong, φ keeps changing, so the output fades in and out and is distorted.
            Keeping a receiver synchronised is what makes DSB-SC reception complex and expensive.
          </p>
          <p>
            That is the trade: <strong>DSB-FC</strong> wastes transmitter power but every receiver is a diode and an
            RC filter. <strong>DSB-SC</strong> is efficient but every receiver needs carrier synchronisation.
          </p>
        </>
      ),
      questions: [
        "r-fc-vs-sc",
        "i-sc-efficient",
        "p-remove-carrier",
        "p-same-bandwidth",
        "i-coherent",
        "r-sync",
        "p-90deg",
        "p-sc-envelope",
        "i-sc-disadvantage",
        "r-broadcast",
        "p-why-keep-carrier",
      ],
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
      title: "Lab 2: Final Oral Exam Preparation",
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
  labId: 2,
  title: "Amplitude Modulation",
  sections: [theory, prepare, offset, modulate, depthSection, wrapUp, exam],
  questions: QUESTIONS,
  bank: BANK,
};

// Scope ranges referred to in the text must exist on the instrument.
if (process.env.NODE_ENV !== "production") {
  for (const v of [1, 2, 5]) if (!VOLTS_DIV.includes(v)) console.warn(`Lab 2 guide: no ${v} V/div range`);
  for (const t of [0.2e-3, 5e-6]) if (!TIME_DIV.includes(t)) console.warn(`Lab 2 guide: no ${t} s/div range`);
}

export default guide;
