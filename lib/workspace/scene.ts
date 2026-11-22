import { DEVICES, DEVICE_IDS, HOME_POSITIONS } from "./devices";
import { PORTS, PORT_LIST } from "../ports/registry";
import type { DeviceId, PortDef } from "../ports/types";

/**
 * Live workspace geometry.
 *
 * Pointer handlers mutate this object directly and DOM subscribers apply the
 * result with CSS transforms, so dragging and zooming never go through a React
 * render. Everything is expressed in world units (CSS px at zoom 1).
 */
export interface View {
  x: number;
  y: number;
  k: number;
}
export interface Point {
  x: number;
  y: number;
}

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 5;

/** Devices may be dragged anywhere inside this world rectangle. */
const WORLD = { minX: -2600, minY: -2000, maxX: 3600, maxY: 3200 };
/** Space kept free for the menu button and the wire toolbar when fitting. */
const INSET = { top: 28, right: 28, bottom: 44, left: 84 };

type Events = {
  view: void;
  device: DeviceId;
  layout: void;
};
type Listener<K extends keyof Events> = (payload: Events[K]) => void;

const listeners: { [K in keyof Events]: Set<Listener<K>> } = {
  view: new Set(),
  device: new Set(),
  layout: new Set(),
};

export const scene = {
  view: { x: 0, y: 0, k: 1 } as View,
  pos: structuredClone(HOME_POSITIONS) as Record<DeviceId, Point>,
  viewport: { w: 1280, h: 800 },
  /** True while a two-finger pinch is in progress; instrument drags yield to it. */
  pinching: false,
};

export function on<K extends keyof Events>(kind: K, fn: Listener<K>): () => void {
  listeners[kind].add(fn);
  return () => listeners[kind].delete(fn);
}
function emit<K extends keyof Events>(kind: K, payload: Events[K]) {
  listeners[kind].forEach((fn) => fn(payload));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function devicesBounds() {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const id of DEVICE_IDS) {
    const p = scene.pos[id];
    const d = DEVICES[id];
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + d.width);
    maxY = Math.max(maxY, p.y + d.height);
  }
  return { minX, minY, maxX, maxY };
}

/** Keep at least part of the equipment on screen so it can never be lost. */
function clampView(v: View): View {
  const k = clamp(v.k, MIN_ZOOM, MAX_ZOOM);
  const b = devicesBounds();
  const { w, h } = scene.viewport;
  const keep = Math.min(160, w * 0.25, h * 0.25);
  // screen-space extents of the equipment for this view
  const x = clamp(v.x, keep - b.maxX * k, w - keep - b.minX * k);
  const y = clamp(v.y, keep - b.maxY * k, h - keep - b.minY * k);
  return { x, y, k };
}

export function setView(v: View) {
  const next = clampView(v);
  const cur = scene.view;
  if (next.x === cur.x && next.y === cur.y && next.k === cur.k) return;
  scene.view = next;
  emit("view", undefined);
}

/** Zoom keeping the world point under (sx, sy) fixed on screen. */
export function zoomAt(sx: number, sy: number, k: number, base: View = scene.view): View {
  const nk = clamp(k, MIN_ZOOM, MAX_ZOOM);
  const wx = (sx - base.x) / base.k;
  const wy = (sy - base.y) / base.k;
  return { x: sx - wx * nk, y: sy - wy * nk, k: nk };
}

export function setDevicePos(id: DeviceId, x: number, y: number) {
  const d = DEVICES[id];
  const p = scene.pos[id];
  p.x = clamp(x, WORLD.minX, WORLD.maxX - d.width);
  p.y = clamp(y, WORLD.minY, WORLD.maxY - d.height);
  emit("device", id);
}

export function setViewport(w: number, h: number) {
  scene.viewport = { w, h };
}

/** Extra space kept free by a docked panel (the lab guide), in screen px. */
const reserved = { right: 0, bottom: 0 };
export function setReservedSpace(space: { right?: number; bottom?: number }) {
  reserved.right = space.right ?? 0;
  reserved.bottom = space.bottom ?? 0;
}

/** The part of the stage that is free of chrome, in screen px. */
export function freeArea() {
  const { w, h } = scene.viewport;
  const width = Math.max(200, w - INSET.left - INSET.right - reserved.right);
  const height = Math.max(200, h - INSET.top - INSET.bottom - reserved.bottom);
  return { x: INSET.left, y: INSET.top, w: width, h: height };
}

/** View that frames a world rectangle inside the free area. */
export function frameView(b: { minX: number; minY: number; maxX: number; maxY: number }, maxZoom = 1.6): View {
  const area = freeArea();
  const bw = Math.max(1, b.maxX - b.minX);
  const bh = Math.max(1, b.maxY - b.minY);
  const k = clamp(Math.min(area.w / bw, area.h / bh), MIN_ZOOM, maxZoom);
  return {
    k,
    x: area.x + (area.w - bw * k) / 2 - b.minX * k,
    y: area.y + (area.h - bh * k) / 2 - b.minY * k,
  };
}

export function fitView(): View {
  return frameView(devicesBounds());
}

export function restoreLayout(pos: Partial<Record<DeviceId, Point>>) {
  for (const id of DEVICE_IDS) {
    const p = pos[id];
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) setDevicePos(id, p.x, p.y);
  }
  emit("layout", undefined);
}

export function commitLayout() {
  emit("layout", undefined);
}

export function screenToWorld(sx: number, sy: number): Point {
  const v = scene.view;
  return { x: (sx - v.x) / v.k, y: (sy - v.y) / v.k };
}

export function portWorld(port: PortDef): Point {
  const p = scene.pos[port.device];
  const d = DEVICES[port.device];
  return { x: p.x + port.x * d.width, y: p.y + port.y * d.height };
}

export function portWorldById(id: string): Point | null {
  const port = PORTS.get(id);
  return port ? portWorld(port) : null;
}

/** World-space pick radius of a connector. */
export function portRadius(port: PortDef): number {
  if (port.r) return port.r;
  const d = DEVICES[port.device];
  return d.portRadius[port.kind] ?? 8;
}

/** Nearest connector to a world point, with a zoom-aware tolerance. */
export function findPortAt(wx: number, wy: number): PortDef | null {
  const slop = 5 / scene.view.k;
  let best: PortDef | null = null;
  let bestD = Infinity;
  for (const port of PORT_LIST) {
    const p = portWorld(port);
    const r = portRadius(port) * 1.15 + slop;
    const dx = p.x - wx;
    const dy = p.y - wy;
    const d2 = dx * dx + dy * dy;
    if (d2 <= r * r && d2 < bestD) {
      best = port;
      bestD = d2;
    }
  }
  return best;
}
