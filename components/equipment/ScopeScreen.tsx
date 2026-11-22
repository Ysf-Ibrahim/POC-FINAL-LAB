"use client";

import { useEffect, useRef } from "react";
import { cableStore } from "@/lib/cables/store";
import { controlsStore, type ScopeControls } from "@/lib/controls/store";
import { MODULE_MODELS } from "@/lib/sim/modules";
import { createAcquirer, H_DIVS, V_DIVS, type ScopeFrame, type ScopeTrace } from "@/lib/sim/scope";
import { scopeStatus } from "@/lib/sim/status";
import { DEVICES } from "@/lib/workspace/devices";
import { scene } from "@/lib/workspace/scene";

/**
 * CRT geometry measured on the photograph (image pixels): the visible glass,
 * and where the engraved 10 × 8 graticule sits inside it.
 */
export const CRT = {
  x: 92,
  y: 99,
  w: 557,
  h: 465,
  /** Graticule centre relative to the glass, and the size of one division. */
  cx: 281.5,
  cy: 225.5,
  div: 53.4,
};

const PHOSPHOR = "190, 246, 255";
const GLOW = "70, 205, 255";
/** Relative beam brightness for increasingly fast deflection. */
const BEAM_LEVELS = [1, 0.74, 0.52, 0.36, 0.1];

/** The oscilloscope display: a canvas laid exactly over the CRT glass. */
export function ScopeScreen() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const glass = document.createElement("canvas"); // background + graticule, redrawn only on resize
    const phosphor = document.createElement("canvas"); // trace layer with persistence
    const pctx = phosphor.getContext("2d")!;

    let acquirer = createAcquirer(cableStore.get().cables, MODULE_MODELS);
    let cables = cableStore.get().cables;
    let frame: ScopeFrame | null = null;
    let dirty = true;
    let raf = 0;
    let lastAcquire = 0;
    let scale = 1; // canvas px per image px
    let glassPower: boolean | null = null;
    let glassInten = -1;
    let seenScope: ScopeControls | null = null;
    let seenEmona: unknown = null;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const onScreen = (CRT.w * DEVICES.scope.width) / DEVICES.scope.px.w; // world px
      const target = Math.round(Math.min(2400, Math.max(420, onScreen * scene.view.k * dpr)));
      if (canvas.width === target) return;
      scale = target / CRT.w;
      const height = Math.round(CRT.h * scale);
      for (const c of [canvas, glass, phosphor]) {
        c.width = target;
        c.height = height;
      }
      glassPower = null;
      dirty = true;
      schedule();
    };

    const drawGlass = (power: boolean, inten: number) => {
      const g = glass.getContext("2d")!;
      const { width: W, height: H } = glass;
      const bg = g.createRadialGradient(W * 0.5, H * 0.46, H * 0.1, W * 0.5, H * 0.5, W * 0.75);
      if (power) {
        bg.addColorStop(0, "#12506a");
        bg.addColorStop(0.6, "#0d3f57");
        bg.addColorStop(1, "#082b3d");
      } else {
        bg.addColorStop(0, "#26414b");
        bg.addColorStop(1, "#16272f");
      }
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      // graticule
      const d = CRT.div * scale;
      const cx = CRT.cx * scale;
      const cy = CRT.cy * scale;
      const left = cx - (H_DIVS / 2) * d;
      const top = cy - (V_DIVS / 2) * d;
      const line = power ? `rgba(196, 234, 246, ${0.3 + inten * 0.08})` : "rgba(176, 204, 212, 0.2)";
      g.strokeStyle = line;
      g.fillStyle = line;
      g.lineWidth = Math.max(1, scale * 0.85);
      g.beginPath();
      for (let i = 0; i <= H_DIVS; i++) {
        const x = Math.round(left + i * d) + 0.5;
        g.moveTo(x, top);
        g.lineTo(x, top + V_DIVS * d);
      }
      for (let j = 0; j <= V_DIVS; j++) {
        const y = Math.round(top + j * d) + 0.5;
        g.moveTo(left, y);
        g.lineTo(left + H_DIVS * d, y);
      }
      // 0.2-division ticks on the centre axes
      const tick = d * 0.075;
      for (let i = 1; i < H_DIVS * 5; i++) {
        if (i % 5 === 0) continue;
        const x = Math.round(left + (i * d) / 5) + 0.5;
        g.moveTo(x, cy - tick);
        g.lineTo(x, cy + tick);
      }
      for (let j = 1; j < V_DIVS * 5; j++) {
        if (j % 5 === 0) continue;
        const y = Math.round(top + (j * d) / 5) + 0.5;
        g.moveTo(cx - tick, y);
        g.lineTo(cx + tick, y);
      }
      g.stroke();
      // dotted 10 % and 90 % rise-time references, as engraved on the tube
      for (const row of [-2.5, 2.5]) {
        const y = cy + row * d;
        for (let i = 0; i <= H_DIVS * 5; i++) g.fillRect(left + (i * d) / 5 - scale * 0.5, y - scale * 0.5, scale, scale);
      }
      g.font = `${Math.round(7.5 * scale)}px ui-sans-serif, system-ui, sans-serif`;
      g.textBaseline = "middle";
      g.fillText("100", left + scale * 2, cy - 3 * d - scale * 6);
      g.fillText("90", left + scale * 2, cy - 2.5 * d - scale * 6);
      g.fillText("10", left + scale * 2, cy + 2.5 * d - scale * 6);
      g.fillText("0%", left + scale * 2, cy + 3 * d - scale * 6);
    };

    const strokeBeam = (c: CanvasRenderingContext2D, path: Path2D, alpha: number, width: number) => {
      if (alpha <= 0.004) return;
      c.lineJoin = "round";
      c.lineCap = "round";
      c.strokeStyle = `rgba(${GLOW}, ${0.1 * alpha})`;
      c.lineWidth = width * 5.5;
      c.stroke(path);
      c.strokeStyle = `rgba(${GLOW}, ${0.28 * alpha})`;
      c.lineWidth = width * 2.6;
      c.stroke(path);
      c.strokeStyle = `rgba(${PHOSPHOR}, ${Math.min(1, 0.96 * alpha)})`;
      c.lineWidth = width;
      c.stroke(path);
    };

    const drawTrace = (c: CanvasRenderingContext2D, t: ScopeTrace, f: ScopeFrame, inten: number, width: number) => {
      const d = CRT.div * scale;
      const left = CRT.cx * scale - (H_DIVS / 2) * d;
      const cy = CRT.cy * scale;
      const W = canvas.width;
      const yOf = (v: number) => cy - (t.offset + (v - t.dc) * t.gain) * d;
      // sample index → canvas x: u = divisions since sweep start, magnified about centre
      const xOf = (i: number) => left + (((i - t.start) / t.perDiv - 5) * f.mag + 5 + f.xShift) * d;
      const iOf = (x: number) => t.start + (((x - left) / d - 5 - f.xShift) / f.mag + 5) * t.perDiv;

      const sweepEnd = t.start + 10.4 * t.perDiv;
      const first = Math.max(t.start, iOf(-4), 0);
      const last = Math.min(sweepEnd, iOf(W + 4), t.data.length - 1);
      if (last <= first) return;

      if (t.flat) {
        const p = new Path2D();
        const y = cy - t.offset * d;
        p.moveTo(xOf(first), y);
        p.lineTo(xOf(last), y);
        strokeBeam(c, p, inten, width);
        return;
      }

      // The beam is brightest where it moves slowly. Each piece of the waveform is
      // sorted by steepness (screen px of deflection per px of sweep) and drawn
      // with the matching intensity, so a 2 kHz sine is bright, a dense carrier
      // is a soft band and logic edges are faint, as on the real tube.
      const pxPerSample = (d * f.mag) / t.perDiv;
      const data = t.data;
      const paths = BEAM_LEVELS.map(() => new Path2D());
      const classOf = (slope: number) => (slope < 4 ? 0 : slope < 12 ? 1 : slope < 40 ? 2 : slope < 400 ? 3 : 4);

      if (pxPerSample >= 0.34) {
        const lerp = (i: number) => {
          const i0 = Math.floor(i);
          return data[i0] + (data[Math.min(data.length - 1, i0 + 1)] - data[i0]) * (i - i0);
        };
        let px = xOf(first);
        let py = yOf(lerp(first));
        let current = -1;
        for (let i = Math.ceil(first + 1e-9); i <= last; i++) {
          const x = xOf(i);
          const y = yOf(data[i]);
          const cls = classOf(Math.abs(y - py) / Math.max(1e-6, x - px));
          if (cls !== current) paths[cls].moveTo(px, py);
          paths[cls].lineTo(x, y);
          current = cls;
          px = x;
          py = y;
        }
      } else {
        // Many samples per pixel: reduce each pixel column to what the beam does in it.
        // Slow stretches stay a continuous line. Fast content is either a single
        // pass through the column (an edge, drawn as a dim line) or part of a band
        // the beam sweeps over and over (drawn as a soft fill).
        const x0 = Math.max(0, Math.floor(xOf(first)));
        const x1 = Math.min(W, Math.ceil(xOf(last)));
        const n = Math.max(0, x1 - x0);
        const fLo = new Float32Array(n).fill(Infinity);
        const fHi = new Float32Array(n).fill(-Infinity);
        const fIn = new Float32Array(n);
        const fOut = new Float32Array(n);
        const fCls = new Uint8Array(n).fill(255);
        const fSum = new Float32Array(n);
        const fCount = new Float32Array(n);
        const toPx = Math.abs(t.gain) * d;
        // a slow run must last this long before it counts as a line of its own
        const minRun = 2.5 / pxPerSample;
        type Piece = { col: number; a: number; b: number; lo: number; hi: number };
        let pending: Piece[] = [];
        let piece: Piece | null = null;
        let runLen = 0;
        let committed = false;
        let lineOpen = false;
        const addFast = (col: number, from: number, to: number, cls: number) => {
          if (fCls[col] === 255) fIn[col] = from;
          fOut[col] = to;
          fCls[col] = cls;
          fSum[col] += Math.abs(to - from);
          fCount[col] += 1;
          const vLo = from < to ? from : to;
          const vHi = from < to ? to : from;
          if (vLo < fLo[col]) fLo[col] = vLo;
          if (vHi > fHi[col]) fHi[col] = vHi;
        };
        const emitLine = (q: Piece) => {
          const x = x0 + q.col + 0.5;
          const yA = yOf(q.a);
          const yB = yOf(q.b);
          if (!lineOpen) paths[0].moveTo(x, yA);
          else paths[0].lineTo(x, yA);
          const yLo = yOf(q.lo);
          const yHi = yOf(q.hi);
          if (Math.abs(yLo - yA) > 1.2 && Math.abs(yLo - yB) > 1.2) paths[0].lineTo(x, yLo);
          if (Math.abs(yHi - yA) > 1.2 && Math.abs(yHi - yB) > 1.2) paths[0].lineTo(x, yHi);
          paths[0].lineTo(x, yB);
          lineOpen = true;
        };
        const endRun = () => {
          if (piece) pending.push(piece);
          for (const q of pending) {
            if (committed) emitLine(q);
            else {
              // too brief to be a line: it belongs to the fast content around it
              addFast(q.col, q.lo, q.hi, 1);
            }
          }
          pending = [];
          piece = null;
          runLen = 0;
          committed = false;
          lineOpen = false;
        };
        for (let col = 0; col < n; col++) {
          const x = x0 + col;
          const a = Math.max(Math.floor(first), Math.floor(iOf(x)));
          const b = Math.min(Math.floor(last), Math.ceil(iOf(x + 1)));
          if (b <= a) continue;
          let prev = data[a];
          for (let i = a + 1; i <= b; i++) {
            const v = data[i];
            const cls = classOf((Math.abs(v - prev) * toPx) / pxPerSample);
            if (cls === 0) {
              if (!piece) piece = { col, a: prev, b: v, lo: Math.min(prev, v), hi: Math.max(prev, v) };
              else {
                piece.b = v;
                if (v < piece.lo) piece.lo = v;
                else if (v > piece.hi) piece.hi = v;
              }
              runLen++;
            } else {
              if (piece || pending.length) endRun();
              addFast(col, prev, v, cls);
            }
            prev = v;
          }
          if (piece) {
            pending.push(piece);
            piece = null;
            if (runLen >= minRun) {
              committed = true;
              for (const q of pending) emitLine(q);
              pending = [];
            }
          }
        }
        endRun();

        // second pass: single passes become lines, repeated coverage becomes a band
        const fills = BEAM_LEVELS.map(() => new Path2D());
        for (let col = 0; col < n; col++) {
          // brightness follows the beam's average speed over the fast part of the column
          if (fCls[col] !== 255) fCls[col] = Math.max(1, classOf((fSum[col] * toPx) / (fCount[col] * pxPerSample)));
        }
        const overlaps = (i: number, j: number) => {
          if (j < 0 || j >= n || fCls[j] === 255) return false;
          const common = Math.min(fHi[i], fHi[j]) - Math.max(fLo[i], fLo[j]);
          const smaller = Math.min(fHi[i] - fLo[i], fHi[j] - fLo[j]);
          return smaller * toPx > 4 && common > smaller * 0.35;
        };
        const isBand = new Uint8Array(n);
        for (let col = 0; col < n; col++) {
          if (fCls[col] !== 255 && (overlaps(col, col - 1) || overlaps(col, col + 1))) isBand[col] = 1;
        }
        const lastLine = new Int32Array(BEAM_LEVELS.length).fill(-2);
        for (let col = 0; col < n; col++) {
          const cls = fCls[col];
          if (cls === 255) continue;
          const x = x0 + col + 0.5;
          if (isBand[col]) {
            // a band's outline is its envelope: take in the neighbouring columns
            let bLo = fLo[col];
            let bHi = fHi[col];
            for (const j of [col - 1, col + 1]) {
              if (j >= 0 && j < n && isBand[j]) {
                if (fLo[j] < bLo) bLo = fLo[j];
                if (fHi[j] > bHi) bHi = fHi[j];
              }
            }
            fills[cls].moveTo(x, yOf(bLo) + 0.5);
            fills[cls].lineTo(x, yOf(bHi) - 0.5);
          } else {
            const yA = yOf(fIn[col]);
            const yB = yOf(fOut[col]);
            const yLo = yOf(fLo[col]);
            const yHi = yOf(fHi[col]);
            if (lastLine[cls] === col - 1) paths[cls].lineTo(x, yA);
            else paths[cls].moveTo(x, yA);
            if (Math.abs(yLo - yA) > 1.2 && Math.abs(yLo - yB) > 1.2) paths[cls].lineTo(x, yLo);
            if (Math.abs(yHi - yA) > 1.2 && Math.abs(yHi - yB) > 1.2) paths[cls].lineTo(x, yHi);
            paths[cls].lineTo(x, yB);
            lastLine[cls] = col;
          }
        }
        c.lineCap = "butt";
        c.lineWidth = 1.02; // exactly one column wide, no halo: neighbouring columns would stack it
        for (let cls = 1; cls < BEAM_LEVELS.length; cls++) {
          c.strokeStyle = `rgba(${PHOSPHOR}, ${Math.min(1, inten * BEAM_LEVELS[cls] * 0.8)})`;
          c.stroke(fills[cls]);
        }
      }
      for (let cls = 0; cls < BEAM_LEVELS.length; cls++) strokeBeam(c, paths[cls], inten * BEAM_LEVELS[cls], width);
    };

    const render = (now: number) => {
      raf = 0;
      const controls = controlsStore.get();
      const s = controls.scope;
      const store = cableStore.get().cables;
      if (store !== cables) {
        cables = store;
        acquirer = createAcquirer(cables, MODULE_MODELS);
        frame = null;
        dirty = true;
      }
      const { width: W, height: H } = canvas;

      if (glassPower !== s.power || glassInten !== s.inten) {
        drawGlass(s.power, s.inten);
        glassPower = s.power;
        glassInten = s.inten;
      }

      // Re-acquire only when something that changes the signal changed; brightness,
      // focus and a new canvas size just repaint the picture already acquired.
      const signalChanged =
        dirty &&
        (!frame ||
          controls.emona !== seenEmona ||
          !seenScope ||
          (Object.keys(s) as (keyof typeof s)[]).some((k) => k !== "inten" && k !== "focus" && s[k] !== seenScope![k]));
      const wasLive = frame?.live ?? false;
      const tick = wasLive && now - lastAcquire >= 33;
      const inten = Math.min(1.2, Math.pow(s.inten, 1.5) * 1.35);
      const width = Math.max(1.1, scale * 1.25) * (1 + (1 - s.focus) * 3.2);
      if (!s.power) {
        frame = null;
        pctx.clearRect(0, 0, W, H);
        scopeStatus.set({ triggered: false, live: false, traces: 0, floating: false, onGround: "" });
      } else if (signalChanged || tick) {
        frame = acquirer.acquire(controls, wasLive);
        lastAcquire = now;
        seenScope = s;
        seenEmona = controls.emona;
        scopeStatus.set({
          triggered: frame.triggered,
          live: frame.live,
          traces: frame.traces.length,
          floating: frame.floating,
          onGround: ["CH1", "CH2", "EXT TRIG"].filter((_, i) => frame!.onGround[i]).join(", "),
        });
        // phosphor persistence: live pictures fade, steady pictures are redrawn clean
        if (frame.live && wasLive && !dirty) {
          pctx.globalCompositeOperation = "destination-out";
          pctx.fillStyle = "rgba(0,0,0,0.42)";
          pctx.fillRect(0, 0, W, H);
        } else {
          pctx.clearRect(0, 0, W, H);
        }
        pctx.globalCompositeOperation = "lighter";
        for (const t of frame.traces) drawTrace(pctx, t, frame, inten, width);
      } else if (dirty && frame) {
        pctx.clearRect(0, 0, W, H);
        pctx.globalCompositeOperation = "lighter";
        for (const t of frame.traces) drawTrace(pctx, t, frame, inten, width);
      }
      dirty = false;

      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(glass, 0, 0);
      if (s.power) {
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(phosphor, 0, 0);
        ctx.globalCompositeOperation = "source-over";
      }
      // faint reflection on the glass and darkening towards the bezel
      const sheen = ctx.createLinearGradient(0, 0, W * 0.7, H);
      sheen.addColorStop(0, "rgba(255,255,255,0.07)");
      sheen.addColorStop(0.35, "rgba(255,255,255,0.012)");
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, W, H);

      if (frame?.live && !document.hidden) schedule();
    };

    function schedule() {
      if (!raf) raf = requestAnimationFrame(render);
    }
    const invalidate = () => {
      dirty = true;
      schedule();
    };

    resize();
    schedule();
    const offs = [cableStore.subscribe(invalidate), controlsStore.subscribe(invalidate)];
    window.addEventListener("bench:settled", resize);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener("bench:settled", resize);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="scope-screen"
      style={{ left: CRT.x, top: CRT.y, width: CRT.w, height: CRT.h }}
      aria-label="Oscilloscope display"
    />
  );
}
