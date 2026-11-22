import { Measure } from "@/components/guide/Measure";
import { Eq, Figure, Lesson, Note, Terms, V } from "@/components/guide/parts";
import { Choice, NumberAnswer } from "@/components/guide/Quiz";
import { switchValue } from "@/lib/controls/emonaControls";
import type { Bench } from "@/lib/guide/bench";
import type { Check, CheckResult, Guide, Section } from "@/lib/guide/types";
import { F_MESSAGE, pcmFrameBits, tlpfCutoff } from "@/lib/sim/modules";
import { CH1, CH2, MESSAGE, steady, volts } from "../am";
import { fedBy, portName, probeOn } from "../checks";
import { timeBase } from "../lab4/bench-tools";
import { SampleDotsFigure } from "../lab6/figures";
import { BitDepthDemo, BoundaryDemo, PcmExplorer, QuantizerDemo, bin8 } from "./explorer";
import { ChainFigure, SlotsFigure } from "./figures";
import { BANK, QUESTIONS } from "./questions";

/**
 * Lab 7 — PCM Encoding and Decoding, with the TDM extension.
 *
 * Parts A–C follow the Experiment 7 lab sheet: Figure 2 (2 kHz SINE → INPUT 1,
 * 8 kHz DIGITAL → CLK, FS and PCM DATA on the scope), Figure 3 (decoder with
 * the encoder's clock and FS, which the sheet's figures and its Figure 4 block
 * diagram take from the 100 kHz DIGITAL output), Figure 5 (Tuneable LPF).
 * Part D, TDM, comes from the lab report and the instructor's demonstration;
 * it is not in the lab sheet. Every check traces the wiring and measures what
 * the encoder, decoder and filter models produce.
 */

// ---------------------------------------------------------------- sockets
const DIG8 = "master.dig8k";
const DIG100 = "master.dig100k";
const DIG2 = "master.dig2k";
const IN1 = "pcmenc.in1";
const IN2 = "pcmenc.in2";
const CLK = "pcmenc.clk";
const FS = "pcmenc.fs";
const DATA = "pcmenc.data";
const D_FS = "pcmdec.fs";
const D_DATA = "pcmdec.data";
const D_CLK = "pcmdec.clk";
const OUT = "pcmdec.out";
const OUT2 = "pcmdec.out2";
const TLPF_IN = "tlpf.in";
const TLPF_OUT = "tlpf.out";
const MODE = "PCM ENCODER mode";

const khz = (hz: number, d = 2) => `${(hz / 1000).toFixed(d)} kHz`;
const us = (s: number) => `${Math.round(s * 1e6)} µs`;

// ------------------------------------------------------------ measurements
/** Frames per second, from the rising edges of FS. */
function frameRate(b: Bench) {
  const dt = 0.5e-6;
  const [f] = b.record([FS], { duration: 8e-3, dt });
  const edges: number[] = [];
  for (let i = 1; i < f.length; i++) if (f[i] > 2.5 && f[i - 1] <= 2.5) edges.push(i);
  return edges.length >= 2 ? (edges.length - 1) / ((edges[edges.length - 1] - edges[0]) * dt) : 0;
}

/** The words on PCM DATA, read bit by bit between FS pulses. */
function words(b: Bench) {
  const dt = 0.5e-6;
  const [d, f, c] = b.record([DATA, FS, CLK], { duration: 4e-3, dt });
  let rises = 0;
  for (let i = 1; i < c.length; i++) if (c[i] > 2.5 && c[i - 1] <= 2.5) rises++;
  if (rises < 4) return { codes: [] as number[], bits: 0 };
  const per = (c.length * dt) / rises / dt;
  const nb = pcmFrameBits(b.controls.emona);
  const codes: number[] = [];
  for (let i = 1; i < f.length; i++) {
    if (f[i - 1] > 2.5 && f[i] <= 2.5) {
      let w = 0;
      for (let j = 0; j < 8; j++) {
        const k = Math.round(i + (j + 0.5) * per);
        if (k >= d.length) return { codes, bits: nb };
        w = w * 2 + (d[k] > 2.5 ? 1 : 0);
      }
      codes.push(w);
    }
  }
  return { codes, bits: nb };
}

/**
 * The held levels at a decoder output, read in the middle of each frame:
 * how many per message cycle, how many of them change, and their range.
 */
function staircase(b: Bench, port: string) {
  const dt = 0.5e-6;
  const [v, f] = b.record([port, FS], { duration: 4 / F_MESSAGE, dt });
  const ends: number[] = [];
  for (let i = 1; i < f.length; i++) if (f[i - 1] > 2.5 && f[i] <= 2.5) ends.push(i);
  const levels: number[] = [];
  for (let k = 0; k + 1 < ends.length; k++) levels.push(v[Math.round((ends[k] + ends[k + 1]) / 2)]);
  let changes = 0;
  for (let k = 1; k < levels.length; k++) if (Math.abs(levels[k] - levels[k - 1]) > 0.004) changes++;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < v.length; i++) {
    lo = Math.min(lo, v[i]);
    hi = Math.max(hi, v[i]);
  }
  const span = ends.length > 1 ? (ends[ends.length - 1] - ends[0]) * dt : 0;
  return { perCycle: span > 0 ? ((ends.length - 1) / span) / F_MESSAGE : 0, tracking: levels.length > 1 && changes >= levels.length / 2, lo, hi };
}

/** First broken link of the encoder, or null. */
function encoderBroken(b: Bench, clock: string | null = null): string | null {
  if (!b.linked(IN1, MESSAGE)) return "the 2 kHz SINE is not on INPUT 1";
  if (b.drivers(IN1).length > 1) return "something else is also connected to INPUT 1";
  const c = b.drivers(CLK);
  if (c.length !== 1) return c.length ? "two outputs are joined on CLK" : "no clock on the encoder's CLK";
  if (clock && c[0] !== clock) return `CLK has ${portName(c[0])}, not ${portName(clock)}`;
  return null;
}

/** First broken link of the decoder (Figure 3), or null. */
function decoderBroken(b: Bench): string | null {
  const enc = encoderBroken(b);
  if (enc) return enc;
  if (!b.linked(D_DATA, DATA)) return "PCM DATA is not on the decoder's PCM DATA";
  if (!b.linked(D_FS, FS)) return "the encoder's FS is not on the decoder's FS";
  if (!b.linked(D_CLK, b.drivers(CLK)[0])) return "the decoder's CLK does not have the encoder's clock";
  for (const p of [D_DATA, D_FS, D_CLK]) if (b.drivers(p).length > 1) return `two outputs are joined on the decoder's ${portName(p).split("· ")[1] ?? p}`;
  return null;
}

const encoderRunning = (clock: string): Check => ({
  label: "Encoder running: one frame per 8 clock periods",
  test: (b) => {
    const broken = encoderBroken(b, clock);
    if (broken) return { ok: false, detail: `Not yet: ${broken}.` };
    const fr = frameRate(b);
    const fc = b.frequency(clock);
    const w = words(b);
    const same = w.codes.length > 1 && new Set(w.codes).size === 1;
    const ok = fr > 0 && Math.abs(fc / fr - 8) < 0.2 && w.codes.length > 0;
    return {
      ok,
      detail: `FS every ${us(1 / Math.max(fr, 1))}: ${khz(fr)} frames per second = ${khz(fc)} / 8. Words seen: ${w.codes.slice(0, 4).map(bin8).join(", ") || "none"}${
        same ? ": the same word every frame, because each sample lands on the same point of the sine" : ""
      }.`,
    };
  },
});

function pamResult(b: Bench, port: string, perCycle: number): CheckResult {
  const broken = decoderBroken(b);
  if (broken) return { ok: false, detail: `Not yet: ${broken}.` };
  const s = staircase(b, port);
  const t = b.tone(port);
  const ok = Math.abs(s.perCycle - perCycle) < 0.3 && s.tracking && t.messageVpp > 2;
  return {
    ok,
    detail:
      s.hi - s.lo < 0.02
        ? `Flat at ${volts(s.lo)}: the output is not following the message.`
        : `Held steps, one per frame, ${s.perCycle.toFixed(1)} per message cycle, from ${volts(s.lo)} to ${volts(s.hi)}; 2 kHz component ${t.messageVpp.toFixed(2)} Vp-p.`,
  };
}

function recovered(b: Bench, minVpp: number): CheckResult {
  const t = b.tone(TLPF_OUT);
  const f = t.messageVpp > 0.05 ? b.frequency(TLPF_OUT, 4e-3, 0.5e-6) : 0;
  const fc = tlpfCutoff(b.controls.emona);
  const ok = t.messageVpp >= minVpp && Math.abs(f - F_MESSAGE) < 120 && t.thd < 5;
  const verdict =
    t.messageVpp < 0.1 ? `fc = ${khz(fc)} is too low: the message itself is cut.` : t.thd >= 5 ? `fc = ${khz(fc)} lets the steps through. Lower fc.` : `fc = ${khz(fc)}.`;
  return {
    ok,
    detail: t.messageVpp < 0.05 ? `No 2 kHz signal. ${verdict}` : `${t.messageVpp.toFixed(2)} Vp-p at ${khz(f)}, distortion ${t.thd.toFixed(1)} %. ${verdict}`,
  };
}

function periodWorking(b: Bench, seconds: number, what: string) {
  const tb = timeBase(b);
  const divs = seconds / tb.seconds;
  return (
    <>
      {what} is <strong>{seconds < 1e-3 ? us(seconds) : `${(seconds * 1e3).toFixed(2)} ms`}</strong> ({khz(1 / seconds)}). At {tb.text} that is{" "}
      <strong>{divs.toFixed(1)} divisions</strong>
      {divs > 10 ? ": more than the screen, so choose a slower TIME/DIV" : divs < 0.8 ? ": too small to read, so choose a faster TIME/DIV" : ""}.
    </>
  );
}

const scopeGrounded: Check = { label: "Oscilloscope grounded to the trainer", test: (b) => ({ ok: b.scopeGrounded }) };
const pcmMode = (b: Bench) => switchValue(b.controls.emona, "pcmenc.mode") === 0;

// ----------------------------------------------------------------- theory
const theory: Section = {
  id: "theory",
  title: "Understand PCM",
  steps: [
    {
      id: "l1-pcm",
      kind: "theory",
      title: "1 · What is PCM, and why?",
      body: (
        <Lesson
          ask="Our message is a smooth voltage. A digital link only carries 0s and 1s. How do we get one into the other?"
          numbers={
            <>
              The message: the trainer&rsquo;s <strong>2 kHz sine</strong>, −2 V to +2 V. The PCM Encoder turns each sample into{" "}
              <strong>8 bits</strong>; the PCM Decoder turns them back.
            </>
          }
          bench={
            <>
              <strong>PCM ENCODER</strong> (INPUT 1, CLK, FS, PCM DATA, and a PCM/TDM switch) and <strong>PCM DECODER</strong> (PCM DATA,
              CLK, FS, OUTPUT, OUTPUT2), both on the trainer&rsquo;s lower half. The TUNEABLE LPF finishes the job.
            </>
          }
          oral="PCM, pulse code modulation, converts an analog message into a serial stream of binary words: the encoder samples the voltage, quantizes it to the nearest level and sends that level's code one bit at a time."
          check={
            <Choice
              q="Why is a message carried as bits harder to damage with noise?"
              options={[
                {
                  text: "The receiver only has to decide 0 or 1, so moderate noise does not change the decision",
                  correct: true,
                  why: "An analog receiver passes every bit of noise on. A digital receiver only asks: above or below the threshold? Small disturbances change nothing.",
                },
                { text: "Bits cannot pick up noise on a wire", why: "They can. The point is that a little noise does not change which of two levels was sent." },
              ]}
            />
          }
        >
          <Terms
            items={[
              ["Analog signal", "Can take any value, at every instant: a microphone's voltage, our sine."],
              ["Digital signal", "Uses a limited set of values at defined times. Here two: 0 and 1, sent as 0 V and 5 V."],
              ["PCM", "Pulse code modulation: the analog message as a stream of binary numbers, one per sample."],
            ]}
          />
          <Figure>
            <ChainFigure />
          </Figure>
          <p>
            <strong>Why bother?</strong> Bits survive noise better, can be regenerated, stored, checked for errors, encrypted, and
            interleaved with other channels. The price: more bandwidth, and a small error from rounding each sample.
          </p>
          <p>Digital does not mean free of rules: the samples must still come fast enough (Nyquist), and the receiver must know when each bit, and each word, starts.</p>
        </Lesson>
      ),
      questions: ["m-pcm", "i-pcm", "p-analog-digital", "p-why-pcm", "i-shapes"],
    },
    {
      id: "l2-sampling",
      kind: "theory",
      title: "2 · Sampling, a quick Lab 6 review",
      body: (
        <Lesson
          ask="Which voltages do we turn into numbers?"
          numbers={
            <>
              Message 2 kHz, so the Nyquist rate is <strong>4 ksample/s</strong>. A rate such as 8 ksample/s gives four samples per
              cycle, 125 µs apart. (What the trainer&rsquo;s encoder actually uses comes in lesson 7.)
            </>
          }
          bench={<>The PCM Encoder samples by itself, with a sample-and-hold inside its codec, timed by its CLK input.</>}
          oral="Sampling measures the message's voltage at regular instants, faster than twice its highest frequency; it does not yet make it binary."
          check={
            <Choice
              q="After sampling, before quantization, what do we have?"
              options={[
                { text: "Analog voltages at separate instants", correct: true, why: "Time is now discrete, but each value can still be anything, like 1.4142 V." },
                { text: "Binary numbers", why: "Not yet: two more steps, quantization and encoding." },
              ]}
            />
          }
        >
          <Figure>
            <SampleDotsFigure />
          </Figure>
          <p>
            Each red dot is one sample: the voltage at that instant. The rule from Lab 6 still holds: <V>f</V>
            <sub>s</sub> &gt; 2<V>f</V>
            <sub>max</sub>, or the samples describe a different, aliased wave.
          </p>
        </Lesson>
      ),
      questions: ["i-three", "p-sampling-binary"],
    },
    {
      id: "l3-quant",
      kind: "theory",
      title: "3 · Quantization",
      body: (
        <Lesson
          ask="We measured 1.13 V. With a limited number of codes, how do we write that down?"
          numbers={
            <>
              With the trainer&rsquo;s levels 15.7 mV apart: 1.13 V lies between level 199 (1.1216 V) and level 200 (1.1373 V); the
              nearer is <strong>200</strong>. Error: 1.1373 − 1.13 = <strong>7.3 mV</strong>. No rounding error is ever more than half a
              step, about 7.8 mV.
            </>
          }
          bench={<>The encoder&rsquo;s codec compares each sample with its 256 levels and picks the nearest.</>}
          oral="Quantization rounds each sample to the nearest of a fixed set of levels; the difference is the quantization error, and it cannot be undone at the receiver."
          check={
            <Choice
              q="The decoder receives code 200. Can it tell whether the sample was 1.13 V or 1.14 V?"
              options={[
                { text: "No: both round to level 200, and only the code is sent", correct: true, why: "Every voltage within half a step of the level gets the same code. The decoder can only output the level itself." },
                { text: "Yes: the code carries the exact voltage", why: "The code only names the level. The difference inside the step was discarded at the encoder." },
              ]}
            />
          }
        >
          <ul>
            <li>A sample can be <strong>any</strong> voltage.</li>
            <li>
              The encoder has a <strong>fixed set of allowed voltages</strong>: the <strong>quantization levels</strong>.
            </li>
            <li>
              <strong>Quantization</strong>: replace the sample by the <strong>nearest</strong> level.
            </li>
            <li>
              <strong>Quantization error</strong>: level − sample. Lost for good: the receiver only learns the level.
            </li>
          </ul>
          <QuantizerDemo />
        </Lesson>
      ),
      why: (
        <p>
          The exact levels depend on the codec&rsquo;s transfer curve. The lab sheet gives only the ends and the middle (00000000 = −2 V,
          10000000 ≈ 0 V, 11111111 = +2 V). This guide, and the simulator, use 256 equally spaced levels with −2 V and +2 V exact, 4/255 =
          15.7 mV apart; a uniform 4/256 = 15.625 mV is the other common convention. Either way, about 16 mV.
        </p>
      ),
      questions: ["m-qerror", "i-survives", "p-exact"],
    },
    {
      id: "l4-bits",
      kind: "theory",
      title: "4 · Why 8 bits give 256 levels",
      body: (
        <Lesson
          ask="How many different numbers can eight 0-or-1 positions make?"
          numbers={
            <>
              <Eq>
                <V>L</V> = 2<sup>N</sup> = 2<sup>8</sup> = 256 &nbsp;·&nbsp; Δ ≈ 4 V / 256 = 15.625 mV
              </Eq>
              A sample within ±2 V is never more than about 7.8 mV from its level.
            </>
          }
          bench={
            <>
              The lab sheet: the codec converts voltages between <strong>−2 V and +2 V</strong> to an <strong>8-bit</strong> number, 256
              numbers from 00000000 to 11111111, one per quantization level.
            </>
          }
          oral="Eight bits give 2 to the power 8, 256 combinations, so 256 quantization levels across −2 to +2 V, about 15.6 mV apart; one more bit would double the levels and halve the step, but make every word one bit longer."
          check={
            <NumberAnswer
              q="How many quantization levels would a 10-bit encoder have?"
              answer={1024}
              unit="levels"
              tolerance={0}
              explain={
                <>
                  2<sup>10</sup> = <strong>1024</strong>. Over the same 4 V the step would be about 3.9 mV: four times finer, at the cost of 10
                  bits per sample instead of 8.
                </>
              }
            />
          }
        >
          <p>
            A <strong>bit</strong> has two values, 0 or 1. Every extra bit doubles the number of combinations:
          </p>
          <Terms
            items={[
              ["1 bit", "0, 1: 2 combinations"],
              ["2 bits", "00, 01, 10, 11: 4"],
              ["4 bits", "16"],
              ["8 bits", "256: the trainer"],
            ]}
          />
          <p>
            The <strong>range</strong> is the span of voltages the encoder accepts: −2 V to +2 V, 4 V wide. 256 levels across it put
            neighbours about <strong>15.6 mV</strong> apart: that is the <strong>resolution</strong>.
          </p>
        </Lesson>
      ),
      questions: ["m-levels", "i-codes", "i-step", "i-more-bits"],
    },
    {
      id: "l5-encode",
      kind: "theory",
      title: "5 · Encoding: binary words, sent one bit at a time",
      body: (
        <Lesson
          ask="The level is number 200. How is that sent down a single wire?"
          numbers={
            <>
              200 = 128 + 64 + 8 = <strong>11001000</strong>. Sent as 1, 1, 0, 0, 1, 0, 0, 0: bit 7 first. Bit 7 is worth 128 steps (about
              2 V); bit 0 is worth one step (about 16 mV).
            </>
          }
          bench={<>The encoder sends each word on <strong>PCM DATA</strong>, one bit per period of its <strong>CLK</strong> input, bit 7 first (lab sheet).</>}
          oral="Each quantized sample becomes an 8-bit binary word that is sent serially, most significant bit first, bit 7 down to bit 0, one bit per clock period."
          check={
            <Choice
              q="Which bit leaves the encoder first?"
              options={[
                { text: "Bit 7, the MSB", correct: true, why: "The lab sheet: bit 7 first, then bit 6, down to bit 0." },
                { text: "Bit 0, the LSB", why: "Bit 0 is last, and FS goes high with it." },
              ]}
            />
          }
        >
          <Terms
            items={[
              ["Binary word", "A fixed group of bits for one number: here 8 bits = one sample."],
              ["MSB (bit 7)", "Most significant bit: worth 128. A mistake here moves the voltage by about half the range."],
              ["LSB (bit 0)", "Least significant bit: worth 1, one quantization step."],
              ["Serial", "One bit after another on one line, one per clock period."],
            ]}
          />
          <PcmExplorer
            rows={["message", "clock", "data", "fs"]}
            caption="The real encoder model: pick a sample and its frame is drawn bit by bit below, with the code it carries. Bits come from the PCM DATA waveform itself, not from a table."
          />
        </Lesson>
      ),
      questions: ["m-order", "p-word", "p-serial", "i-msb-error"],
    },
    {
      id: "l6-error",
      kind: "theory",
      title: "6 · Quantization error and resolution",
      body: (
        <Lesson
          ask="What do more bits buy, and what happens to a voltage beyond the range?"
          numbers={
            <Terms
              items={[
                ["2 bits", "4 levels, step 1.33 V: a crude staircase."],
                ["4 bits", "16 levels, step 0.27 V."],
                ["8 bits", "256 levels, step 15.7 mV: the trainer."],
              ]}
            />
          }
          bench={<>The trainer is fixed at 8 bits. The 2- and 4-bit cases below are only to compare; they use the same rule with fewer levels.</>}
          oral="Quantization error is the gap between a sample and its level; more bits mean closer levels and smaller error, but longer words; a voltage beyond the range is clipped to the end code, a much larger error."
          check={
            <NumberAnswer
              q="With the trainer's 8 bits (levels 15.7 mV apart), what is the largest rounding error, in mV?"
              answer={7.84}
              unit="mV"
              tolerance={0.05}
              explain={
                <>
                  Half a step: 15.7 / 2 ≈ <strong>7.8 mV</strong>. A sample half-way between two levels is that far from both.
                </>
              }
            />
          }
        >
          <BitDepthDemo />
          <p>
            <strong>Clipping.</strong> The codec only covers −2 V to +2 V. Raise the message above 2 V peak and every sample above +2 V
            gets 11111111: the tops are flattened. Try it:
          </p>
          <PcmExplorer
            rows={["message", "pam", "recon"]}
            controls={["amp"]}
            caption="The real encoder and decoder. Raise the message above 2 V: the decoded steps stop at ±2 V and the recovered sine has flat tops. Lower it to 0.2 V: only a few codes are used."
          />
        </Lesson>
      ),
      questions: ["i-clip", "i-range", "i-rate-change", "p-rate-depth"],
    },
    {
      id: "l7-clock",
      kind: "theory",
      title: "7 · The clock",
      body: (
        <Lesson
          ask="How does the receiver know when to read each bit, and how often is the message actually sampled?"
          numbers={
            <>
              <Eq>
                frame rate = sampling rate = <V>f</V>
                <sub>CLK</sub> / 8
              </Eq>
              8kHz DIGITAL (8.33 kHz): 8.33 kbit/s, one sample every 960 µs, <strong>1.04 ksample/s</strong>, below the 4.17 kHz Nyquist
              rate. 100kHz DIGITAL: 100 kbit/s, one sample every 80 µs, <strong>12.5 ksample/s</strong>, six per message cycle.
            </>
          }
          bench={
            <>
              The lab sheet&rsquo;s Part 1 uses <strong>8kHz DIGITAL</strong> and reasons with Nyquist. Its decoding and recovery figures
              (Figures 3 to 5, and the Figure 4 block diagram) use <strong>100kHz DIGITAL</strong>, as the instructor advised and as the lab
              report&rsquo;s photos match.
            </>
          }
          oral="The clock tells the encoder and decoder when each bit starts; on this trainer one bit goes out per clock period, eight per sample, so the sampling rate is the clock divided by eight: 12.5 kHz with the 100 kHz clock."
          check={
            <NumberAnswer
              q="The encoder runs on the 100 kHz clock. What is its sampling rate, in kHz?"
              answer={12.5}
              unit="kHz"
              explain={
                <>
                  Eight bits per sample, one bit per clock period: 100 / 8 = <strong>12.5 kHz</strong>, a sample every 80 µs. That is six samples
                  per 2.08 kHz cycle, well above Nyquist.
                </>
              }
            />
          }
        >
          <p>
            Bits arrive one after another. A <strong>clock</strong> is a steady square wave that marks <strong>when each bit begins</strong>.
            The encoder puts out one bit per clock period; the decoder reads one bit per period of <em>the same</em> clock. With a different
            clock it would read some bits twice and miss others.
          </p>
          <Terms
            items={[
              ["Sampling frequency", "Voltage measurements per second."],
              ["Bit clock", "The timing signal: one period per bit."],
              ["Bit rate", "Bits per second on the line: N × fs for one channel."],
              ["Frame (word) rate", "Words per second: here one word per sample, so equal to the sampling rate."],
            ]}
          />
          <PcmExplorer
            rows={["message", "clock", "data", "fs", "pam"]}
            presets
            caption="Switch between the trainer's two clocks. With 8 kHz a frame lasts 960 µs (4 ms shown): one sample per two message cycles, always at the same point, so the decoded output is flat. With 100 kHz, six samples per cycle."
          />
          <Note tone="exam" title="If you are asked why 8 kHz">
            Give the lab sheet&rsquo;s reasoning, f<sub>s</sub> ≥ 2 × 2 kHz = 4 kHz, then add what the timing shows: the encoder sends 8 bits
            per sample, so 8 kHz is the <em>bit</em> clock and the sample rate is about 1 kHz; the decoding figures use 100 kHz.
          </Note>
        </Lesson>
      ),
      why: (
        <p>
          The lab sheet&rsquo;s own Figure 1 shows eight clock periods per frame. The lab report&rsquo;s decoder photo shows six steps per
          message cycle, which is 12.5 ksample/s: the 100 kHz clock. With the trainer&rsquo;s clocks phase-locked, 8 kHz gives exactly one
          sample per two message cycles; the simulator&rsquo;s timing follows Figure 1.
        </p>
      ),
      questions: ["m-nyquist", "i-rates", "i-bit-clock", "i-hundred", "m-stolen", "p-8k"],
    },
    {
      id: "l8-fs",
      kind: "theory",
      title: "8 · Frame synchronization (FS)",
      body: (
        <Lesson
          ask="Even knowing when every bit arrives, how do we know which eight bits belong together?"
          numbers={
            <>
              One frame = 8 bits = 8 clock periods: 80 µs with the 100 kHz clock. FS is high for one clock period, <strong>during bit 0</strong>,
              once per frame.
            </>
          }
          bench={
            <>
              Encoder <strong>FS</strong> output → decoder <strong>FS</strong> input. The lab sheet: FS goes high at the same time bit 0 is
              output. It also makes a good scope trigger.
            </>
          }
          oral="The clock marks each bit; FS marks the word boundary. On this trainer FS goes high with bit 0, the last bit of each word, so the decoder knows the word is complete and that the next bit is the next word's bit 7."
          check={
            <Choice
              q="When is FS high on this trainer?"
              options={[
                { text: "During bit 0, the last bit of each word", correct: true, why: "The lab sheet, and its Figure 1. Because words have a fixed length, the end marker also gives the next word's start." },
                { text: "During bit 7, the first bit", why: "A common guess, but not this trainer: FS goes high with bit 0." },
                { text: "On every bit", why: "That is what the clock does. FS marks only one bit per frame." },
              ]}
            />
          }
        >
          <p>
            A <strong>frame</strong> is one complete word on the line. The clock cannot show where frames begin: every clock period looks the
            same. The <strong>frame synchronization</strong> signal marks one bit per frame, so the decoder knows how to group the bits.
          </p>
          <BoundaryDemo />
          <p>Start reading one bit late and every word is built from the end of one sample and the start of the next: every voltage is wrong, though every bit was received correctly.</p>
        </Lesson>
      ),
      questions: ["i-fs-bit0", "i-clock-fs", "p-why-fs", "p-middle", "p-why-bit0", "i-mismatch", "i-trigger", "m-sync-ways", "i-other-sync"],
    },
    {
      id: "l9-decode",
      kind: "theory",
      title: "9 · Decoding",
      body: (
        <Lesson
          ask="The decoder receives bits. How does it give back a voltage?"
          numbers={
            <>
              The lab sheet&rsquo;s reference values: <strong>00000000 → −2 V</strong>, <strong>10000000 → about 0 V</strong>,{" "}
              <strong>11111111 → +2 V</strong>, proportional in between. Code 200 → −2 + 200/255 × 4 = 1.137 V.
            </>
          }
          bench={
            <>
              The <strong>PCM DECODER</strong> needs three inputs from the encoder: PCM DATA, its CLK and its FS. Output on{" "}
              <strong>OUTPUT</strong>.
            </>
          }
          oral="The decoder reads the bits with the encoder's clock, uses FS to find each complete word, converts the word into its voltage and holds that voltage until the next word: a PAM signal."
          check={
            <Choice
              q="Why does the decoder need the encoder's own clock, not just any clock of the right speed?"
              options={[
                { text: "Its bit times must line up with the encoder's, or bits are misread", correct: true, why: "Even a tiny difference makes the reading drift until bits are read twice or skipped. Sharing the same clock guarantees the match." },
                { text: "Any clock near 100 kHz works", why: "Near is not enough: the decoder is not self-clocking, so its reading times would slip against the data." },
              ]}
            />
          }
        >
          <Figure>
            <ChainFigure decode />
          </Figure>
          <PcmExplorer rows={["data", "fs", "pam"]} caption="Pick a sample: the decoded voltage appears when FS marks bit 0 of its frame, and stays until the next frame is complete." />
        </Lesson>
      ),
      questions: ["m-decode", "m-mapping", "i-dac", "p-clock-wrong"],
    },
    {
      id: "l10-pam",
      kind: "theory",
      title: "10 · Why the decoder gives PAM",
      body: (
        <Lesson
          ask="Why doesn't the decoder produce a smooth sine straight away?"
          numbers={<>With the 100 kHz clock: one new level every 80 µs, six steps per 480 µs cycle: 0, +1.73, +1.73, 0, −1.73, −1.73 V for a sine sampled at 0°, 60°, 120° …</>}
          bench={<>The decoder&rsquo;s OUTPUT is the staircase; the lab sheet calls it the PAM version of the message.</>}
          oral="The decoder gets one number per frame, so it can output one voltage per frame and holds it until the next: a staircase of pulse amplitudes, PAM, like Lab 6's sample-and-hold, not the two-level PCM data."
          check={
            <Choice
              q="Is the PAM staircase the same thing as PCM DATA?"
              options={[
                { text: "No: PCM DATA is two-level bits; PAM is held analog voltages", correct: true, why: "The data line only ever shows 0 or 5 V. The PAM output takes 256 possible levels, one per sample." },
                { text: "Yes: both are pulses", why: "Both are pulse signals, but PCM codes the sample in bits, PAM in the pulse's height." },
              ]}
            />
          }
        >
          <p>
            Each word gives one voltage, held until the next: exactly what Lab 6&rsquo;s sample-and-hold produced, except that each level is
            now a <em>quantized</em> one. <strong>PAM</strong>, pulse amplitude modulation: the sample is carried in each step&rsquo;s height.
          </p>
          <PcmExplorer rows={["message", "pam"]} caption="The decoder's real output against the message (dashed). Pick a sample: its step starts one frame after it was taken, because the word must arrive first." />
        </Lesson>
      ),
      questions: ["p-pam", "p-pam-vs-data", "e-pam"],
    },
    {
      id: "l11-lpf",
      kind: "theory",
      title: "11 · Reconstruction with the LPF",
      body: (
        <Lesson
          ask="How does a low-pass filter turn the staircase back into a sine?"
          numbers={
            <>
              12.5 ksample/s: the first images sit at 12.5 − 2.08 = <strong>10.4 kHz</strong> and 12.5 + 2.08 = 14.6 kHz. A cutoff around 3 kHz
              passes 2.08 kHz and removes them.
            </>
          }
          bench={<>Decoder OUTPUT → TUNEABLE LPF IN. GAIN in the middle (×1); fc around 3 kHz.</>}
          oral="The PAM staircase contains the message plus high-frequency components from its steps; a low-pass filter passes the 2 kHz message and removes the rest, so the output is a smooth sine at the original frequency, close to but not exactly the original."
          check={
            <Choice
              q="Can the LPF remove the quantization error?"
              options={[
                { text: "No: the rounding is in the sample values themselves", correct: true, why: "The filter smooths the steps, but each step's height was already rounded. That small error stays, as quantization noise." },
                { text: "Yes, by smoothing", why: "Smoothing removes the step edges, not the rounding of each level." },
              ]}
            />
          }
        >
          <ul>
            <li>Too low a cutoff: the message itself is cut.</li>
            <li>Too high: the steps stay visible.</li>
            <li>Just right: a smooth 2 kHz sine, a little delayed.</li>
          </ul>
          <PcmExplorer rows={["pam", "recon"]} controls={["cutoff"]} caption="The Tuneable LPF model on the decoder's real output. Move the cutoff and measure the result below." />
          <p>The LPF cannot repair wrong decoding, and it cannot undo aliasing: with too slow a clock the staircase already describes the wrong wave.</p>
        </Lesson>
      ),
      questions: ["m-q2", "m-q1", "i-lpf", "i-cutoff", "p-lpf-qerror"],
    },
    {
      id: "l12-tdm",
      kind: "theory",
      title: "12 · Time division multiplexing (TDM)",
      body: (
        <Lesson
          ask="Two messages, one wire. How can both use it?"
          numbers={
            <>
              With the 100 kHz clock and two 8-bit slots per frame: a frame lasts 160 µs, so each channel is sampled at{" "}
              <strong>6.25 kHz</strong>, three samples per 2 kHz cycle. The line still carries 100 kbit/s.
            </>
          }
          bench={
            <>
              Not in the lab sheet: from the lab report and the instructor&rsquo;s demonstration. The encoder&rsquo;s <strong>PCM/TDM</strong>{" "}
              switch to TDM; the sine stays on INPUT 1, the <strong>2kHz DIGITAL</strong> output goes on INPUT 2. The decoder puts them back on
              OUTPUT and OUTPUT2.
            </>
          }
          oral="TDM lets several channels share one link by taking turns: each gets its own time slot in every frame, and the receiver, synchronized to the frame, sends each slot to its own output."
          check={
            <Choice
              q="How is TDM different from FDM?"
              options={[
                { text: "TDM gives each channel its own time slot; FDM its own frequency band", correct: true, why: "In TDM channels take turns on the whole band; in FDM they all transmit at once, each in a different band." },
                { text: "TDM is digital and FDM is not", why: "That is not the defining difference: one shares time, the other shares frequency." },
              ]}
            />
          }
        >
          <Figure>
            <SlotsFigure />
          </Figure>
          <Terms
            items={[
              ["Time slot", "The share of each frame given to one channel."],
              ["Why sync matters", "The receiver must know where a frame starts to know which slot is which."],
              ["PCM vs TDM", "PCM turns a sample into bits; TDM shares a link between channels."],
              ["Cost", "More channels at the same per-channel rate need a faster link: M × N × fs bits per second."],
            ]}
          />
          <PcmExplorer
            tdmToggle
            initial={{ tdm: true }}
            caption="TDM on the simulated trainer: orange shading marks channel 2's slot in each frame. The sine (channel 1) and the square wave (channel 2) share PCM DATA and come back separately."
          />
          <Note tone="hardware" title="Model assumption">
            The lab sheet does not give the TDM frame layout. The simulator uses two 8-bit slots per frame, INPUT 1 first, with FS on the
            frame&rsquo;s last bit. That matches the lab report&rsquo;s photos: half as many decoded steps per cycle as in PCM mode.
          </Note>
        </Lesson>
      ),
      questions: ["i-tdm", "i-tdm-pcm", "i-fdm", "i-tdm-id", "i-tdm-cost", "p-same-slot", "p-capacity", "p-marker-id", "p-tdm-why", "i-tdm-demo"],
    },
    {
      id: "l13-whole",
      kind: "theory",
      title: "13 · Follow a sample from end to end",
      body: (
        <>
          <p>
            <strong>Analog → sampled voltage → quantized level → binary code → serial bits → decoded voltage → PAM → LPF → the message
            again.</strong> Pick any sample and follow it; change the clock, the size of the message, the cutoff or the mode.
          </p>
          <PcmExplorer presets tdmToggle controls={["clock", "amp", "cutoff"]} />
        </>
      ),
      questions: ["i-pcm", "i-rate-change", "i-constant"],
    },
  ],
};

// ---------------------------------------------------------------- Part A
const partA: Section = {
  id: "encode",
  title: "Part 1 · PCM encoding",
  steps: [
    {
      id: "a-wire",
      kind: "connect",
      title: "Wire the encoder (Figure 2)",
      highlight: {
        links: [
          [MESSAGE, IN1],
          [DIG8, CLK],
          [FS, CH1],
          [DATA, CH2],
          ["scope.ch1.gnd", "gnd.left"],
        ],
        controls: [MODE, "CH1 VOLTS/DIV", "CH2 VOLTS/DIV", "TIME/DIV"],
      },
      body: (
        <>
          <ol>
            <li>
              PCM ENCODER switch on <strong>PCM</strong>.
            </li>
            <li>
              2kHz SINE → <strong>INPUT 1</strong>: the message to encode.
            </li>
            <li>
              8kHz DIGITAL → <strong>CLK</strong>: the lab sheet&rsquo;s Part 1 clock.
            </li>
            <li>
              <strong>FS</strong> → CH1 and <strong>PCM DATA</strong> → CH2. CH1 black node → GND. Both channels <strong>2 V/div</strong>, DC.
            </li>
            <li>
              Trigger on <strong>CH1</strong> (FS), TIME/DIV <strong>0.2 ms</strong>.
            </li>
          </ol>
          <p>The lab sheet asks you to record FS and PCM DATA here.</p>
        </>
      ),
      why: <p>FS on CH1 and triggering on it make every sweep start at the same point of a frame, so the bits line up from sweep to sweep.</p>,
      checks: [
        { label: "Encoder in PCM mode", test: (b) => ({ ok: pcmMode(b), detail: pcmMode(b) ? undefined : "The switch is on TDM." }) },
        { label: "2 kHz SINE on INPUT 1", test: fedBy(IN1, MESSAGE) },
        { label: "8 kHz DIGITAL on CLK", test: fedBy(CLK, DIG8) },
        { label: "FS on CH1", test: probeOn(CH1)(FS) },
        { label: "PCM DATA on CH2", test: probeOn(CH2)(DATA) },
        scopeGrounded,
        encoderRunning(DIG8),
      ],
      questions: ["m-steps", "e-data"],
    },
    {
      id: "a-frames",
      kind: "observe",
      title: "FS and PCM DATA: count the frame",
      highlight: { controls: ["TIME/DIV", "INT TRIGGER"] },
      body: (
        <>
          <ul>
            <li>CH2: PCM DATA, two levels (0 and 5 V), changing only on clock edges.</li>
            <li>CH1: a short FS pulse, once per frame, during bit 0.</li>
          </ul>
          <Measure
            label="time between FS pulses"
            unit="µs"
            precondition={(b) => (encoderBroken(b) ? "Wire the encoder first." : frameRate(b) <= 0 ? "No FS pulses yet." : null)}
            truth={(b) => {
              const fr = frameRate(b);
              return fr > 0 ? 1e6 / fr : null;
            }}
            working={(b, v) => periodWorking(b, v * 1e-6, "One frame")}
            hint="Measure from one FS pulse to the next, in divisions, and multiply by TIME/DIV."
          />
          <Choice
            q="FS comes every 960 µs with the 8 kHz clock. How many samples per second is that?"
            options={[
              {
                text: "About 1,040: one per frame, 8 clock periods each",
                correct: true,
                why: "1 / 960 µs ≈ 1.04 kHz = 8.33 kHz / 8. Below the 4.17 kHz Nyquist rate for the 2.08 kHz message: too slow to decode this message.",
              },
              { text: "8,000: the clock frequency", why: "Each sample needs eight clock periods, one per bit. Count the clock edges between FS pulses: eight." },
            ]}
          />
        </>
      ),
      why: (
        <p>
          The lab sheet&rsquo;s text treats the 8 kHz clock as the sampling rate; its Figure 1 shows eight clock periods per frame. The
          frame period on FS is the real sampling period: the instructor&rsquo;s advice too, f = 1/T<sub>frame</sub>.
        </p>
      ),
      checks: [encoderRunning(DIG8), { label: "Steady picture", test: steady }],
      questions: ["m-nyquist", "i-bit-clock", "i-fs-bit0", "i-trigger"],
    },
    {
      id: "a-100k",
      kind: "connect",
      title: "The 100 kHz clock (Figures 3–5)",
      highlight: {
        links: [[DIG100, CLK]],
        unlink: [[DIG8, CLK]],
        controls: ["TIME/DIV"],
      },
      body: (
        <>
          <p>
            Move the CLK lead from 8kHz DIGITAL to <strong>100kHz DIGITAL</strong>: the clock of the lab sheet&rsquo;s decoding figures and
            of the instructor&rsquo;s demonstration.
          </p>
          <ul>
            <li>FS now comes every <strong>80 µs</strong>: 12.5 ksample/s, six samples per message cycle.</li>
            <li>
              TIME/DIV <strong>10 µs</strong>: one bit per division, a frame in 8 divisions. At <strong>20 µs</strong>, one frame per 4
              divisions.
            </li>
            <li>The pattern changes from frame to frame: each word is a different sample of the sine.</li>
          </ul>
          <Measure
            label="frame period with the 100 kHz clock"
            unit="µs"
            precondition={(b) => (!b.linked(CLK, DIG100) ? "Put 100kHz DIGITAL on CLK first." : null)}
            truth={(b) => {
              const fr = frameRate(b);
              return fr > 0 ? 1e6 / fr : null;
            }}
            working={(b, v) => periodWorking(b, v * 1e-6, "One frame")}
          />
        </>
      ),
      checks: [
        { label: "100 kHz DIGITAL on CLK", test: fedBy(CLK, DIG100) },
        encoderRunning(DIG100),
        {
          label: "Words follow the message",
          test: (b) => {
            if (encoderBroken(b, DIG100)) return { ok: false };
            const w = words(b);
            const distinct = new Set(w.codes).size;
            return { ok: distinct >= 4, detail: `${distinct} different words in ${w.codes.length} frames, as the sine moves.` };
          },
        },
      ],
      questions: ["i-hundred", "i-rates", "i-constant"],
    },
  ],
};

// ---------------------------------------------------------------- Part B
const partB: Section = {
  id: "decode",
  title: "Part 2 · PCM decoding",
  steps: [
    {
      id: "b-wire",
      kind: "connect",
      title: "Wire the decoder (Figure 3)",
      highlight: {
        links: [
          [DATA, D_DATA],
          [FS, D_FS],
          [DIG100, D_CLK],
          [MESSAGE, CH1],
          [OUT, CH2],
        ],
        unlink: [
          [FS, CH1],
          [DATA, CH2],
        ],
        controls: ["CH1 VOLTS/DIV", "CH2 VOLTS/DIV", "CH2 POSITION", "TIME/DIV", "INT TRIGGER"],
      },
      body: (
        <>
          <ol>
            <li>
              Encoder PCM DATA → decoder <strong>PCM DATA</strong>.
            </li>
            <li>
              Encoder FS → decoder <strong>FS</strong>.
            </li>
            <li>
              100kHz DIGITAL → decoder <strong>CLK</strong>: the same clock as the encoder, &ldquo;stolen&rdquo; from it.
            </li>
            <li>Scope: remove FS → CH1 and DATA → CH2. Then 2kHz SINE → CH1, decoder OUTPUT → CH2. Both 1 V/div.</li>
            <li>
              Trigger on <strong>CH1</strong> (the message), TIME/DIV <strong>0.1 ms</strong>. Use <strong>CH2 POSITION</strong> to bring the
              whole staircase on screen.
            </li>
          </ol>
        </>
      ),
      why: (
        <p>
          All three are needed. DATA carries the numbers; CLK says when to read each bit; FS says which bits make a word. The lab
          sheet&rsquo;s decoder is not self-clocking and cannot find frames by itself.
        </p>
      ),
      checks: [
        { label: "PCM DATA into the decoder", test: fedBy(D_DATA, DATA) },
        { label: "FS into the decoder", test: fedBy(D_FS, FS) },
        {
          label: "Decoder CLK = the encoder's clock",
          test: (b) => {
            const c = b.drivers(CLK)[0];
            if (!c) return { ok: false, detail: "The encoder has no clock." };
            return b.linked(D_CLK, c) && b.drivers(D_CLK).length === 1 ? { ok: true, detail: portName(c) } : { ok: false, detail: b.drivers(D_CLK)[0] ? `The decoder has ${portName(b.drivers(D_CLK)[0])}; the encoder has ${portName(c)}.` : undefined };
          },
        },
        { label: "Message on CH1", test: probeOn(CH1)(MESSAGE) },
        { label: "Decoder OUTPUT on CH2", test: probeOn(CH2)(OUT) },
        { label: "Decoded staircase following the message", test: (b) => pamResult(b, OUT, 6) },
      ],
      questions: ["m-stolen", "i-clock-fs", "m-decode"],
    },
    {
      id: "b-look",
      kind: "observe",
      title: "The PAM staircase",
      highlight: { controls: ["TIME/DIV", "CH2 VOLTS/DIV"] },
      body: (
        <>
          <ul>
            <li>Flat steps that follow the sine on CH1, one sample late.</li>
            <li>Six steps per message cycle, as in the lab report&rsquo;s photo.</li>
            <li>To measure one step, TIME/DIV 20 µs: one step spans 4 divisions.</li>
          </ul>
          <NumberAnswer
            q="Steps per message cycle with the 100 kHz clock?"
            answer={6}
            unit="steps"
            tolerance={0}
            explain={
              <>
                12.5 ksample/s ÷ 2.083 kHz = <strong>6</strong>: each step lasts one frame, 80 µs, and 6 × 80 µs = 480 µs, one message cycle.
              </>
            }
          />
          <Measure
            label="length of one step"
            unit="µs"
            precondition={(b) => (decoderBroken(b) ? "Wire the decoder first." : null)}
            truth={(b) => {
              const fr = frameRate(b);
              return fr > 0 ? 1e6 / fr : null;
            }}
            working={(b, v) => periodWorking(b, v * 1e-6, "Each step lasts one frame, which")}
            hint="At 20 µs/div one step spans 4 divisions: measure from one jump to the next."
          />
        </>
      ),
      checks: [{ label: "Decoded staircase", test: (b) => pamResult(b, OUT, 6) }, { label: "Steady picture", test: steady }],
      questions: ["e-pam", "p-pam", "i-dac"],
    },
    {
      id: "b-faults",
      kind: "observe",
      title: "What each connection does (optional)",
      highlight: { ports: [D_DATA, D_FS, D_CLK] },
      body: (
        <>
          <p>Not in the lab sheet. Remove one lead at a time, watch CH2, then put it back (or press Undo):</p>
          <Terms
            items={[
              ["DATA removed", "The decoder reads only 0s: 00000000, so the output sits at −2 V."],
              ["FS removed", "No word is ever marked complete: the output freezes."],
              ["CLK on 8kHz DIGITAL", "Bits read at the wrong times; FS no longer lines up with whole words: the output is wrong."],
            ]}
          />
        </>
      ),
      checks: [
        {
          label: "Decoder output right now",
          test: (b) => {
            if (!b.linked(D_DATA, DATA)) return { ok: false, detail: `No DATA: output at ${volts(b.reading(OUT).mean)}.` };
            if (!b.linked(D_FS, FS)) return { ok: false, detail: `No FS: output frozen at ${volts(b.reading(OUT).mean)}.` };
            const r = pamResult(b, OUT, 6);
            return r.ok ? { ok: true, detail: "All three connected: the staircase follows the message." } : r;
          },
        },
      ],
      questions: ["p-clock-wrong", "i-mismatch", "p-why-fs"],
    },
  ],
};

// ---------------------------------------------------------------- Part C
const partC: Section = {
  id: "recover",
  title: "Part 3 · Recovering the message",
  steps: [
    {
      id: "c-wire",
      kind: "connect",
      title: "Filter the PAM (Figure 5)",
      highlight: {
        links: [
          [OUT, TLPF_IN],
          [TLPF_OUT, CH2],
        ],
        unlink: [[OUT, CH2]],
        controls: ["TUNEABLE LPF fc", "TUNEABLE LPF GAIN"],
      },
      body: (
        <ol>
          <li>
            Decoder OUTPUT → TUNEABLE LPF <strong>IN</strong>.
          </li>
          <li>Move CH2 to the LPF OUT. GAIN in the middle.</li>
          <li>
            Set <strong>fc</strong> to about 3 kHz: above the message, well below the 10.4 kHz image. Try the ends: fully clockwise the steps
            show; fully anticlockwise the sine disappears.
          </li>
        </ol>
      ),
      checks: [
        {
          label: "Encoder and decoder working",
          test: (b) => {
            const broken = decoderBroken(b);
            return broken ? { ok: false, detail: `Not yet: ${broken}.` } : { ok: true };
          },
        },
        { label: "Decoder OUTPUT into the LPF", test: fedBy(TLPF_IN, OUT) },
        { label: "LPF output on CH2", test: probeOn(CH2)(TLPF_OUT) },
        { label: "Recovered 2 kHz sine", test: (b) => (decoderBroken(b) || !b.linked(TLPF_IN, OUT) ? { ok: false, detail: "The chain is incomplete." } : recovered(b, 2)) },
      ],
      questions: ["m-q2", "i-lpf", "i-cutoff"],
    },
    {
      id: "c-measure",
      kind: "observe",
      title: "Measure the recovered message",
      highlight: { controls: ["TIME/DIV"] },
      body: (
        <>
          <Measure
            label="period of the recovered message"
            unit="µs"
            precondition={(b) => (b.tone(TLPF_OUT).messageVpp < 0.2 ? "No recovered sine at the LPF output yet." : null)}
            truth={(b) => {
              const f = b.frequency(TLPF_OUT, 4e-3, 0.5e-6);
              return f > 0 ? 1e6 / f : null;
            }}
            working={(b, v) => periodWorking(b, v * 1e-6, "The period")}
            hint="From one upward zero crossing to the next, in divisions, times TIME/DIV."
          />
          <Choice
            q="Lab sheet, Question 1: what should be the frequency of the final output?"
            options={[
              { text: "2 kHz, the message frequency", correct: true, why: "PCM changes how the message is carried, not what it is. About 480 µs on the trainer: 2.08 kHz." },
              { text: "12.5 kHz, the sampling rate", why: "That is how often samples are taken; the filter removes it." },
              { text: "100 kHz, the clock", why: "That is the bit rate on the line, not the message." },
            ]}
          />
          <p>
            Compare with CH1: the same frequency and shape, a little delayed by the decoding and the filter. A slight difference in size or
            shape is normal: quantization error and the filter remain.
          </p>
        </>
      ),
      checks: [{ label: "Recovered 2 kHz sine", test: (b) => (decoderBroken(b) ? { ok: false, detail: "The chain is incomplete." } : recovered(b, 2)) }, { label: "Steady picture", test: steady }],
      questions: ["m-q1", "e-recon", "p-lpf-qerror"],
    },
  ],
};

// ---------------------------------------------------------------- Part D
const partD: Section = {
  id: "tdm",
  title: "Part 4 · TDM (from the lab report)",
  steps: [
    {
      id: "d-tdm",
      kind: "connect",
      title: "Switch to TDM and add a second channel",
      highlight: {
        links: [
          [DIG2, IN2],
          [OUT, CH2],
        ],
        unlink: [[TLPF_OUT, CH2]],
        controls: [MODE],
      },
      body: (
        <>
          <Note tone="hardware" title="Not in the lab sheet">
            This part follows the lab report and the instructor&rsquo;s demonstration. The frame layout in TDM mode is this simulator&rsquo;s
            model (two 8-bit slots, INPUT 1 first); it agrees with the report&rsquo;s photos.
          </Note>
          <ol>
            <li>
              Encoder switch to <strong>TDM</strong>.
            </li>
            <li>
              2kHz DIGITAL → <strong>INPUT 2</strong>. The sine stays on INPUT 1.
            </li>
            <li>Move CH2 back to the decoder OUTPUT.</li>
          </ol>
          <ul>
            <li>OUTPUT: the sine channel, now <strong>3 steps</strong> per cycle, each twice as long (160 µs).</li>
            <li>Move CH2 to OUTPUT2: the square-wave channel, 0 to +2 V (the encoder clips its 5 V to +2 V).</li>
          </ul>
        </>
      ),
      why: (
        <p>
          A frame now carries two words, so it lasts twice as long: each channel gets one slot per frame, 6.25 ksample/s each, while the
          line still runs at 100 kbit/s. Using a sine and a square wave makes the two recovered channels easy to tell apart.
        </p>
      ),
      checks: [
        {
          label: "Encoder switch on TDM",
          test: (b) => ({ ok: !pcmMode(b) }),
        },
        { label: "2 kHz DIGITAL on INPUT 2", test: fedBy(IN2, DIG2) },
        {
          label: "Frames twice as long: 16 bits",
          test: (b) => {
            const fr = frameRate(b);
            const fc = b.frequency(b.drivers(CLK)[0] ?? CLK);
            return { ok: fr > 0 && Math.abs(fc / fr - 16) < 0.4, detail: fr > 0 ? `FS every ${us(1 / fr)}: ${(fc / fr).toFixed(0)} clock periods per frame.` : "No FS." };
          },
        },
        { label: "OUTPUT: channel 1, 3 steps per cycle", test: (b) => (pcmMode(b) ? { ok: false } : pamResult(b, OUT, 3)) },
        {
          label: "OUTPUT2: channel 2, the square wave",
          test: (b) => {
            if (pcmMode(b) || decoderBroken(b)) return { ok: false };
            const r = b.reading(OUT2, { duration: 4 / F_MESSAGE, dt: 0.5e-6 });
            const f = b.frequency(OUT2, 4e-3, 0.5e-6);
            return { ok: r.vpp > 1.5 && Math.abs(f - F_MESSAGE) < 150, detail: `${volts(r.min)} to ${volts(r.max)} at ${khz(f)}.` };
          },
        },
      ],
      questions: ["e-tdm", "e-tdm-steps", "i-tdm", "i-tdm-demo"],
    },
    {
      id: "d-recover",
      kind: "connect",
      title: "Recover the TDM sine channel",
      highlight: {
        links: [
          [OUT, TLPF_IN],
          [TLPF_OUT, CH2],
        ],
        unlink: [[OUT, CH2], [OUT2, CH2]],
        controls: ["TUNEABLE LPF fc"],
      },
      body: (
        <>
          <p>
            Keep OUTPUT on the LPF (from Part 3), move CH2 to the LPF output. A 2 kHz sine again: the lab report&rsquo;s Figure 10.
          </p>
          <p>
            With 6.25 ksample/s the first image is at 6.25 − 2.08 = 4.17 kHz, much closer than in PCM mode: keep fc near 2.5–3 kHz.
          </p>
          <p>The square-wave channel is checked directly on OUTPUT2: a sine reconstruction filter would round off its edges.</p>
        </>
      ),
      checks: [
        { label: "TDM mode", test: (b) => ({ ok: !pcmMode(b) }) },
        { label: "LPF output on CH2", test: probeOn(CH2)(TLPF_OUT) },
        { label: "Recovered 2 kHz sine from channel 1", test: (b) => (pcmMode(b) || decoderBroken(b) || !b.linked(TLPF_IN, OUT) ? { ok: false, detail: "TDM mode with the decoder OUTPUT on the LPF." } : recovered(b, 2)) },
      ],
      questions: ["i-tdm-cost", "p-capacity", "i-fdm"],
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
              ["Encoder", "Sampled the 2 kHz sine, quantized it to 8 bits and sent each word MSB first on PCM DATA; FS marked bit 0."],
              ["Clock", "One bit per period: 8 kHz gave a frame every 960 µs; 100 kHz, every 80 µs (12.5 ksample/s)."],
              ["Decoder", "With the encoder's DATA, CLK and FS: a PAM staircase, six steps per cycle."],
              ["LPF", "Smoothed it into the 2 kHz sine, period about 480 µs."],
              ["TDM", "Two channels in alternate slots; both came back separately; the sine with three steps per cycle."],
            ]}
          />
          <Note tone="exam" title="A 30-second answer">
            The PCM encoder sampled the 2 kHz sine, rounded each sample to one of 256 levels between −2 and +2 V and sent it as an 8-bit word,
            MSB first, with FS high on bit 0. The decoder, given the same clock and FS, rebuilt each word into a voltage and held it, giving a
            PAM staircase, and the low-pass filter removed the step components to recover the 2 kHz message. In TDM mode two inputs shared
            the line in alternate time slots and were separated again at the decoder.
          </Note>
        </>
      ),
      questions: ["i-pcm", "e-recon", "e-tdm"],
    },
    {
      id: "g-sheet",
      kind: "summary",
      title: "The lab sheet's questions",
      body: <p>The lab sheet asks two questions at the end; the rest of section A comes from its explanations.</p>,
      questions: ["m-q1", "m-q2"],
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
      title: "Lab 7: Final Oral Exam Preparation",
      body: (
        <p>
          Every question for this lab, by source. <strong>Practice oral exam</strong> asks one at a time, hardest first, and brings back the
          ones you did not know. The next step is a one-page revision sheet.
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
              ["PCM", "The analog message as serial binary words, one per sample."],
              ["Sampling / quantization / encoding", "When to measure / which level / which bits."],
              ["Quantization error", "Level − sample; at most half a step; not recoverable."],
              ["Binary word, MSB, LSB", "8 bits per sample; bit 7 (×128) first, bit 0 (×1) last."],
              ["Clock", "Marks each bit time; the decoder must use the encoder's."],
              ["FS", "Marks each word: high with bit 0 on this trainer."],
              ["PAM", "The decoder's held levels: a staircase, not the bit stream."],
              ["TDM", "Channels take turns in time slots on one link."],
            ]}
          />
          <h3 className="g-sub">Formulas and values</h3>
          <Eq>
            <V>L</V> = 2<sup>N</sup> = 256 &nbsp;·&nbsp; Δ ≈ 4 V/256 ≈ 15.6 mV &nbsp;·&nbsp; |error| ≤ Δ/2 ≈ 7.8 mV &nbsp;·&nbsp; <V>R</V> = <V>N</V>·
            <V>f</V>
            <sub>s</sub>
          </Eq>
          <ul>
            <li>−2 V = 00000000, ≈ 0 V = 10000000, +2 V = 11111111.</li>
            <li>Trainer: one bit per clock, 8 per frame: f<sub>s</sub> = clock/8. 100 kHz → 12.5 ksample/s, 80 µs frames, 6 steps per cycle.</li>
            <li>8 kHz clock (lab sheet Part 1): 960 µs frames, about 1 ksample/s.</li>
            <li>Final output: 2 kHz (480 µs on the trainer). TDM, two slots: 6.25 ksample/s per channel, 3 steps per cycle.</li>
          </ul>
          <h3 className="g-sub">Connections</h3>
          <ul>
            <li>Encoder: 2kHz SINE → INPUT 1; clock → CLK (8 kHz in Figure 2, 100 kHz in Figures 3–5).</li>
            <li>Decoder: PCM DATA → PCM DATA; FS → FS; the encoder&rsquo;s clock → CLK. OUTPUT → Tuneable LPF → CH2.</li>
            <li>TDM: switch to TDM; 2kHz DIGITAL → INPUT 2; channel 1 on OUTPUT, channel 2 on OUTPUT2.</li>
          </ul>
          <h3 className="g-sub">Mistakes to avoid</h3>
          <ul>
            <li>Saying FS goes high with bit 7: on this trainer it is bit 0.</li>
            <li>Calling the PAM staircase &ldquo;PCM&rdquo;: PCM is the bit stream.</li>
            <li>Thinking the LPF removes quantization error or fixes aliasing.</li>
            <li>Giving the decoder a different clock from the encoder.</li>
            <li>Confusing bit clock, bit rate and sampling rate.</li>
          </ul>
          <h3 className="g-sub">Answers to know by heart</h3>
          <ol className="must-know">
            <li>PCM converts an analog message into serial binary words.</li>
            <li>Encoding: sample, quantize to the nearest level, encode as bits, send serially.</li>
            <li>8 bits give 2⁸ = 256 levels over −2 to +2 V, about 15.6 mV apart.</li>
            <li>Quantization error is at most half a step and cannot be recovered.</li>
            <li>More bits: finer levels, smaller error, longer words.</li>
            <li>MSB, bit 7, is sent first; FS goes high with bit 0.</li>
            <li>The clock marks bit times; FS marks word boundaries.</li>
            <li>The decoder needs DATA, the encoder&rsquo;s clock and FS.</li>
            <li>The decoder holds one voltage per word: a PAM staircase.</li>
            <li>The LPF removes the step components and recovers the 2 kHz message.</li>
            <li>The final output frequency is 2 kHz, the message frequency.</li>
            <li>On this trainer the sampling rate is the clock divided by 8.</li>
            <li>TDM shares one link by time slots; FDM by frequency bands.</li>
            <li>PCM makes bits from samples; TDM interleaves channels.</li>
            <li>More TDM channels need more capacity, or a lower rate per channel.</li>
          </ol>
        </>
      ),
    },
  ],
};

const guide: Guide = {
  labId: 7,
  title: "PCM Encoding and Decoding",
  sections: [theory, partA, partB, partC, partD, conclusions, exam],
  questions: QUESTIONS,
  bank: BANK,
};

export default guide;
