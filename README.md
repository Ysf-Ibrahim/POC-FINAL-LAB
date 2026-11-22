# Virtual Communication Lab

An interactive bench for the Principles of Communication laboratory: the **EMONA Telecoms-Trainer 101** (black BiSKIT board) and the **PROMAX OD-402B** 20 MHz oscilloscope. Patch the trainer with leads, connect it to the oscilloscope, and the CRT shows the signal.

This is Phase 1: the shared bench (instruments, wiring, navigation, signal engine). The individual labs are routes that reuse the same bench; their content is not written yet.

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
lib/
  ports/                 port registry: every socket, by id, in image-normalised coordinates
  cables/                lead state, undo history, cable geometry
  controls/              front-panel state of both instruments (pure data)
  sim/                   signal engine, module models, oscilloscope acquisition
  workspace/             live scene geometry, motion, instrument definitions
  labs/                  lab configurations (number and title for now)
public/equipment/        the two instrument photographs (WebP)
```

The visual layer and the signal layer are separate: `lib/sim` knows nothing about rendering and the components know nothing about how a module behaves. A future lab adds data to `lib/labs` and refers to sockets by id (for example `master.sine2k`, `scope.ch1`).

Dragging, zooming and cable routing write CSS transforms and SVG attributes directly; React re-renders only when leads or settings change.

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
| UTILITIES | comparator (TTL out), half-wave rectifier, diode + RC detector, RC low-pass at 2.6 kHz |
| TUNEABLE LPF | 8th-order elliptic, 600 Hz – 12 kHz, gain 0–2, fc×100 clock |
| CHANNEL MODULE | 100 kHz band-pass (6th-order Chebyshev, 24 kHz), 1.6 kHz 4th-order Butterworth low-pass (gain 0.9), adder |
| VCO | LO 1–17 kHz, HI 60–140 kHz, input ±3 V |
| TWIN PULSE GENERATOR | width 5–40 µs, delay 50–300 µs |
| DUAL ANALOG SWITCH | two switches summed at OUT; sample-and-hold clocked by CONTROL 1 |
| PCM ENCODER / DECODER | 8-bit offset binary over ±2 V, MSB first, FS on bit 0 |
| NOISE GENERATOR, EXOR | band-limited white noise with −6 dB and −20 dB taps; TTL exclusive-OR |
| PROBE ADJ | 0.5 Vp-p square wave |

### Assumptions

These are not confirmed by the documents available and are marked `Assumption` in `lib/sim/modules/index.ts`:

- Phase relationship between the MASTER SIGNALS outputs (all rising together at t = 0).
- MULTIPLIER AC inputs block DC below about 200 Hz.
- Diode detector: ideal diode, same RC as the RC LPF.
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
- **Labs 2–7**: navigation only.
