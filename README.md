# Virtual Communication Lab

An interactive bench for the Principles of Communication laboratory: the **EMONA Telecoms-Trainer 101** (black BiSKIT board) and the **PROMAX OD-402B** 20 MHz oscilloscope. Patch the trainer with leads, connect it to the oscilloscope, and the CRT shows the signal.

Every lab is a route on the same bench. **Lab 2 (Amplitude Modulation)**, **Lab 3 (Amplitude Demodulation)**, **Lab 4 (Frequency Modulation)** and **Lab 5 (Frequency Demodulation)** have full guidelines: theory, the practical steps with live checks, and an oral-exam question bank. Labs 6 and 7 are routes without a guideline yet; the menu marks each lab with a tick or "Not implemented".

## Run it

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev        # http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

## Deploy to Vercel

The app is fully static (no backend, no environment variables, no API keys).

1. Push the project to a Git repository (GitHub, GitLab or Bitbucket).
2. On vercel.com choose **Add New → Project**, import the repository and keep the detected defaults (framework: Next.js, build command: `next build`).
3. Deploy.

Or from the project folder: `npx vercel` for a preview, `npx vercel --prod` for production.

Read **Image rights** below before sharing the public link.

## Using the bench

| Action | How |
| --- | --- |
| Move an instrument | Drag it by its body |
| Pan | Drag the bench, or two-finger scroll |
| Zoom | Pinch, Ctrl/⌘ + scroll, mouse wheel, `+` / `−`; `0` fits the screen |
| Connect a lead | Pick a colour, then drag from one socket to another, or click one socket and then the other |
| Connect the oscilloscope | Each input (CH1, CH2, EXT TRIG) has two nodes: red = signal, black = ground. Run a lead from the red node to the socket you want to see, and a lead from a black node to a GND socket |
| Remove a lead | Remove tool, then click the lead or a socket. Or click a lead and press Delete |
| Change a lead's colour | Choose the colour and draw the lead again over the old one |
| Undo | Toolbar button or Ctrl/⌘ + Z |
| Turn a knob | Click it: a slider opens beside it. Drag the slider, click its rail, scroll over it, or use the arrow keys (Shift for bigger steps, Home/End for the end stops). Range switches (VOLTS/DIV, TIME/DIV) only land on their printed settings |
| Turn a knob without the slider | Press on the knob and drag right/up or left/down; hold Shift for fine adjustment |
| Close the slider | Click anywhere else, click the knob again, or press Escape. Only one slider is open at a time |
| Reset a knob | The ↺ button in its slider, or double-click the knob |
| Slide switch, push button | Click the position you want; clicking the handle moves it to the next position |

The bench (positions, leads, settings) is saved in the browser's local storage and restored on reload. Benches saved by earlier versions are converted on load: the old red/black oscilloscope cable becomes two leads, and a lead that ran from a trainer GND socket to an input (when an input was a single socket) is moved to that input's ground node.

Hovering a connector shows its name.

## Structure

```
app/                     routes: / (Kit) and /lab/2 … /lab/7; the bench lives in the root layout
components/
  workspace/             bench surface, pan/zoom, movable instruments, view controls, readout
  equipment/             EmonaTrainer, PromaxOscilloscope, ScopeScreen (CRT canvas), control parts
  wiring/                cable rendering (SVG) and the wire toolbar
  nav/                   lab menu
  guide/                 lab guideline: panel, marks on the bench, question bank, content building blocks
lib/
  ports/                 port registry: every socket, by id, in image-normalised coordinates
  cables/                lead state, undo history, cable geometry
  controls/              front-panel state of both instruments (pure data)
  sim/                   signal engine, module models, oscilloscope acquisition
  workspace/             live scene geometry, motion, instrument definitions
  guide/                 guide types, bench inspection (nets and measured voltages), guide state
  labs/                  lab list; one folder per lab with a guideline (lab2/: steps, figures, questions)
public/equipment/        the two instrument photographs (WebP)
```

The visual layer and the signal layer are separate: `lib/sim` knows nothing about rendering and the components know nothing about how a module behaves. A lab guideline is data in `lib/labs/<lab>` and refers to sockets by id (for example `master.sine2k`, `scope.ch1`).

Dragging, zooming and cable routing write CSS transforms and SVG attributes directly; React re-renders only when leads or settings change.

## Lab guidelines

Opening a lab shows the normal bench and a small card with **Start guideline**. Nothing starts by itself.

- **Theory first.** The guideline opens with short explanation screens, then moves to the bench.
- **Manual work only.** Each practical step marks the sockets to join (a ring on each, a dotted hint between them) or the knobs and switches to adjust. The guide never plugs a lead or turns a control.
- **Live status, no gating.** A step shows whether its requirement is met, with the value it measured, but Next is always available and never pressed for you.
- **Why?** Every step carries a fuller explanation behind a disclosure.
- **Oral questions** sit with the part they belong to, and the last screen is the complete question bank with a Test yourself mode.
- **Resume.** The step reached is remembered per lab in local storage. Leaving the lab closes the guide; the wiring stays.

### How a step is checked

Checks never look at the step number or at which button was pressed. `lib/guide/bench.ts` reads the same leads, controls and module models as the oscilloscope:

- *Connections* are tested electrically (same net), so any equivalent wiring counts: either GND socket, a lead chained through another socket, X and Y swapped on the multiplier.
- *Levels* are measured by running the circuit: for Lab 2 the DC level and peak-to-peak value at the Adder output, and P, Q and the modulation index from the waveform at the Multiplier output. Remove the carrier lead and the AM check fails, because there is no AM signal.

### Lab 2 sources

The sequence, connections and values (2 kHz 4 Vp-p message, 100 kHz 4 Vp-p carrier, AM = (message + DC) × carrier) follow the Experiment 2 lab sheet. Every oral question carries a label saying where it comes from: reported by students as asked, taken from notes of the instructor's lab explanations, from the lab sheet, or predicted. Predicted questions are never presented as having been asked.

Where the trainer differs from the simple theory, the guide says so: the Adder inverts; VDC reaches only ±2.5 V, so 4 V of DC needs the Adder's g gain; the "2 kHz" output is 2.083 kHz. The multiplier is modelled with k = 1 and no output clipping (see Assumptions), so voltages at its output may be larger than on a real board; the modulation index, which is a ratio, is not affected.

### Lab 3 sources

Procedure, block diagrams (Figures 2, 4, 5) and node numbers 1–7 follow the Experiment 3 lab sheet; the transmitter checks are shared with Lab 2 (`lib/labs/am.ts`). Each node step asks the student to move the CH2 lead, and refuses to tick while two outputs are joined (for example CH2 still on the previous node, or the RC LPF fed by both the Rectifier and the Diode & RC LPF), and while the Rectifier feeds the Diode & RC LPF (two diodes in series). Checks report the measured 2 kHz message, carrier ripple, distortion and DC level at each node.

Two results are stated honestly rather than to match a slogan:

- **Amplitude of the two receivers.** Stage for stage the extra RC filter attenuates (node 5 → node 6 loses about a fifth), as the instructor explains. But node 7 comes out larger than node 4, because the Diode & RC LPF holds the carrier peaks while the Rectifier followed by the separate RC LPF averages the half-wave pulses. Photos of the real bench point the same way. The guide teaches both.
- **Over-modulation and the Tuneable LPF.** A steep filter set just above 2 kHz removes the harmonics that over-modulation creates, so a single test tone looks clean again. The guide raises fc before over-modulating and explains why this cannot work for a real message.

### Lab 4 sources and teaching method

Procedure from the Experiment 4 lab sheet: VCO input grounded to map the LO and HI rest-frequency ranges (Part A), the rest frequency tuned to 10 kHz in LO (Part B), the 2 kHz sine applied (Part C). Part D, the effect of message amplitude, is the lab sheet's stated aim done with the sine instead of speech, using the BUFFER amplifier in front of the VCO; it is marked optional.

Each theory step follows one pattern (`Lesson` in `components/guide/parts.tsx`): the question, the idea in plain words with a figure, the numbers, the link to the trainer, the sentence to say in the oral, and a check of understanding (`components/guide/Quiz.tsx`: multiple choice or a number, never blocking). The **FM explorer** (`lib/labs/lab4/explorer.tsx`) draws message, carrier and FM on one time axis, builds the FM by accumulating phase from f = f_rest + k·v, and reads every number off that model; it can load the student's own VCO settings from the bench. In the practical, students type the frequencies they measure on the scope and get the working back in divisions of their TIME/DIV; in Part D they record readings in a small table.

Every lab's final question bank now has a **Practice oral exam** mode: one question at a time, hardest first, self-rated, with missed questions coming back. A step whose checks are not met shows **Skip** instead of Next.

### Lab 5 sources and teaching method

Procedure from the Experiment 5 lab sheet: FM generated as in Lab 4, the COMPARATOR with REF on GND, the TWIN PULSE GENERATOR calibrated on the 8 kHz digital clock (DELAY fully left, WIDTH set so the pulse spans 2.4 div at 5 µs/div = 12 µs), the comparator moved onto CLK to make the zero-crossing detector, then the low-pass filter and the BUFFER, and the recovered message measured on the scope (2.4 div at 0.2 ms/div ≈ 2.08 kHz). Where the student report used in preparation differs, the guide follows the lab sheet and labels the report's observation:

- **Filter.** The lab sheet uses the CHANNEL MODULE's baseband LPF; the report used the TUNEABLE LPF. The checks accept either, and say which one is in use.
- **Q1 or Q2.** The lab sheet takes the pulses from Q1. Q2 (the delayed pulse) gives the same average, so it is accepted with a note.
- **8 kHz clock.** The trainer's "8 kHz" output is 8.333 kHz (period 120 µs); the guide says so where the calibration is done.

The theory follows the Lab 4 lesson pattern. Its **demodulator explorer** (`lib/labs/lab5/explorer.tsx`) runs the real signal engine on a virtual chain (VCO → comparator → pulse generator → LPF → buffer), so experiments with frequency, pulse width, LPF cutoff and buffer gain show the same behaviour as the bench, including pulse overlap when the pulses are wider than the shortest FM period. In the practical, students measure the pulse width and the recovered frequency themselves (`components/guide/Measure.tsx`).

The TWIN PULSE GENERATOR's WIDTH now starts at about 21 µs (it used to start at exactly 12 µs), so the calibration step needs a real adjustment. On this model the baseband LPF output is small (about 0.1 Vp-p, about 1 Vp-p after the BUFFER at full gain); the report's route through the TUNEABLE LPF at full gain gives about 4 Vp-p.

### Adding a guideline for another lab

1. Create `lib/labs/labN/guide.tsx` exporting a `Guide` (see `lib/guide/types.ts`): sections of steps, each with a body, an optional `why`, `highlight` (sockets and controls by id/name), `checks` (functions of the `Bench`) and question ids.
2. Register it in `lib/labs/guides.ts`. It is loaded on demand, so it costs other pages nothing.

## Equipment photographs

Both photographs are the ones supplied with the project brief. A search of the manufacturers' sites, archives, Wikimedia Commons, university pages and distributors found no better cable-free, straight-on photograph of either instrument, and did not find the original source of either photo.

Processing applied (no content was added or redrawn in the photographs):

- **PROMAX OD-402B** — perspective-rectified from lines printed on the front panel so the panel is square-on, then cropped to the front face (the carry handle below the case is not shown). Source size 2048 × 1365, final 1762 × 722.
- **EMONA ETT-101** — rectified to the printed module frame, upscaled 2× with bicubic resampling and cropped to the case. Source size 900 × 771, final 1635 × 1353. It is the limiting factor for sharpness when zoomed in.

### Image rights

No licence permitting reuse was found for either photograph. The instruments, their panel artwork and most likely the photographs are © PROMAX Electronica and © Emona Instruments. Using them in a class project is one thing; **before publishing the site publicly, ask both companies for permission or replace the images with photographs you take yourself** of the lab's own equipment (same framing, and the port map still applies after re-measuring).

## What is mapped

**Trainer sockets (89, all of them).** Centres were detected on the photograph and each socket was named from the panel legend: ADDER, three MULTIPLIERs, TWIN PULSE GENERATOR, DUAL ANALOG SWITCH, NOISE GENERATOR, BUFFER, CHANNEL MODULE, PHASE SHIFTER, UTILITIES, TUNEABLE LPF, both GND sockets, VARIABLE DCV, SPEECH, EXOR, VCO, SEQUENCE GENERATOR, DIVIDER, PCM ENCODER, MASTER SIGNALS, SERIAL TO PARALLEL, PCM DECODER. Not sockets and therefore not mapped: headphone jack, DC IN, EXPANSION connector.

**Oscilloscope connectors.** CH1 (X), CH2 (Y) and EXT TRIG IN, each as a signal node and a ground node drawn over its BNC; PROBE ADJ; ground post. The two-node block is the app's way of exposing the BNC's two conductors, not a part photographed on the instrument.

**Oscilloscope controls that work.** POWER, INTEN, FOCUS, both POSITION knobs, both VOLTS/DIV switches (5 V – 5 mV), X1/X5 MAG, vertical MODE (CH1/CH2/DUAL/ADD), NORM/INV, AC/GND/DC, TIME/DIV (0.2 s – 0.2 µs), horizontal POSITION, X1/X10 MAG, CAL/VAR with the sweep VARIABLE knob, trigger LEVEL, SLOPE, trigger MODE (AUTO/NORM), SOURCE (INT/LINE/EXT) and CH1/CH2/VERT.

**Trainer controls that work.** Trimmers: ADDER G and g, WIDTH, DELAY, BUFFER GAIN, TUNEABLE LPF fc and GAIN, VDC, VCO GAIN and FREQ. Switch: VCO HI/LO.

## Signal engine

Leads define nets; each module is a small time-domain model stepped once per sample. The oscilloscope model applies coupling, gain, position, the triggered sweep and the magnifier. A stable picture needs a valid trigger, exactly as on the instrument: with the trigger source on CH1 and a signal only on CH2 the display runs free.

### Ground

The oscilloscope measures each input against its own chassis. A BNC input carries two conductors, the centre pin (signal) and the shell (ground), so each input is shown as two nodes on the connector: red for the signal and black for ground. The black nodes of all inputs and the ground post are one electrical point, and that point is not the trainer's ground until a lead joins them.

- A black node wired to a trainer GND socket (or the scope's ground post wired to GND): the input reads the socket voltage. One ground lead serves all inputs, because the black nodes are common.
- No ground connection: the readout shows "no ground reference" and the trace wanders. That picture is an approximation of a floating input, not a prediction of what a particular bench would show.
- Ground is decided only by what is electrically connected. The colour of a lead plays no part: a red lead from a black node to GND grounds the scope, and a black lead between two trainer sockets does not.
- A trainer GND socket wired to a red (signal) node is legal and reads 0 V; the bench says so when the lead is made and in the readout, because it is usually a slip for the black node.
- A black node wired to a socket that is not ground: the scope reads relative to that socket. With a real ground also connected, the chassis shorts that socket to ground, as it would on the bench.
- PROBE ADJ is referenced to the scope itself and needs no ground lead.

Figures come from Emona's User Manual (sample edition), specification sheet and lab manual, and from the panels themselves.

| Module | Model |
| --- | --- |
| MASTER SIGNALS | 100 kHz sine/cosine/digital, 8.333 kHz and 2.083 kHz digital, 2.083 kHz sine; all phase-locked; 4 Vp-p analogue, 0–5 V digital |
| VARIABLE DCV | VDC ±2.5 V, +5 V rail |
| ADDER | −(G·A + g·B), gains 0–2, inverting |
| MULTIPLIERs | k·X·Y with k = 1 |
| BUFFER | gain 0–10 |
| UTILITIES | comparator (TTL out), half-wave rectifier, diode + RC detector (peak follower), RC low-pass at 2.6 kHz; both rectifying blocks lose one 0.7 V diode drop |
| TUNEABLE LPF | 8th-order elliptic, 600 Hz – 12 kHz, gain 0–2, fc×100 clock |
| CHANNEL MODULE | 100 kHz band-pass (6th-order Chebyshev, 24 kHz), 1.6 kHz 4th-order Butterworth low-pass (gain 0.9), adder |
| VCO | LO 1–17 kHz, HI 60–140 kHz, input ±3 V; f = f_rest + k·v with k set by GAIN, phase accumulated (one law shared with the guides) |
| TWIN PULSE GENERATOR | width 5–40 µs, delay 50–300 µs |
| DUAL ANALOG SWITCH | two switches summed at OUT; sample-and-hold clocked by CONTROL 1 |
| PCM ENCODER / DECODER | 8-bit offset binary over ±2 V, MSB first, FS on bit 0 |
| NOISE GENERATOR, EXOR | band-limited white noise with −6 dB and −20 dB taps; TTL exclusive-OR |
| PROBE ADJ | 0.5 Vp-p square wave |

### Assumptions

These are not confirmed by the documents available and are marked `Assumption` in `lib/sim/modules/index.ts`:

- Phase relationship between the MASTER SIGNALS outputs (all rising together at t = 0).
- MULTIPLIER AC inputs block DC below about 200 Hz.
- Rectifier and Diode & RC LPF: a silicon diode with the simplified 0.7 V forward drop used in the lab explanation (whether the trainer's RECTIFIER is a plain diode or a precision rectifier is not published); the diode detector uses the same RC as the RC LPF.
- TUNEABLE LPF: an ideal 8th-order elliptic filter (no switched-capacitor clock feed-through), so the 100 kHz ripple is removed completely at both receiver outputs.
- TUNEABLE LPF: logarithmic fc trimmer.
- VCO: at full GAIN, ±3 V sweeps the whole range.
- Sample-and-hold samples on the rising edge of CONTROL 1.
- PCM DECODER reads data on the falling clock edge.
- NOISE GENERATOR level of 1 V rms at 0 dB.
- PROBE ADJ frequency of 1 kHz.
- Ungrounded inputs pick up about 2 V peak of 50 Hz hum with some 3rd and 5th harmonic. The real amount depends on the bench and the trainer's power supply.
- No output clipping: the supply-rail limits of the modules are not published.
- The oscilloscope's range tables (10 VOLTS/DIV steps, 19 TIME/DIV steps, X5 MAG on CH1 only) were read from the photograph and agree with the GoldStar OS-9020P, which appears to be the same instrument under another name. PROMAX's own OD-402B manual was not found.

### Not implemented

- **Trainer modules with no signal yet** (sockets can be patched, the output stays at 0 V): PHASE SHIFTER, SEQUENCE GENERATOR, DIVIDER, SERIAL TO PARALLEL, SPEECH. The reason for each is in `UNSIMULATED_MODULES`. PCM ENCODER TDM mode and PCM DECODER OUTPUT2 are also not modelled.
- **Oscilloscope**: X-Y mode (its switch position is hidden in the photograph), TV-V / TV-H triggering, the VOLTS/DIV VARIABLE knobs (fixed at CAL), TRACE ROTATION, bandwidth limiting.
- **Indicators on the range switches**: the white pointers on VOLTS/DIV and TIME/DIV and the index lines on the small knobs are drawn by the app so the settings can be read; the photograph underneath shows the knobs as they were when it was taken.
- **Labs 6–7**: navigation only; no guideline yet.
- **Lab 4**: the free-running VCO is not locked to the message, so the FM trace on the oscilloscope overlaps from sweep to sweep, as on the real instrument; the guide's FM explorer shows one sweep. Speech and square-wave messages from the lab sheet's overview are not used (the trainer's SPEECH module is not simulated).
- **Lab 2 and 3 guidelines**: the MATLAB parts of the lab sheets are explained but not run; there is no spectrum analyser on the bench, so spectra are shown as illustrations, not measured.
- **Bench impedances**: modules do not load each other; each output drives its net as an ideal source. This is why the Rectifier + RC LPF path behaves as a pure average.
