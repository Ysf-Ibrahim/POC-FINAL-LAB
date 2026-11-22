import type { Point } from "../workspace/scene";

/** Cubic Bézier: start, two handles, end. */
export type Curve = [Point, Point, Point, Point];

/**
 * Shape of a patch lead between two plugs: a cubic with both handles pulled
 * downwards, which reads as a slack cable. Slack grows with length and is
 * reduced for near-vertical runs so leads between stacked instruments stay tidy.
 */
export function cableCurve(a: Point, b: Point): Curve {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const horizontal = dist > 0 ? Math.abs(dx) / dist : 0;
  const sag = dist < 0.5 ? 0 : Math.min(170, 10 + dist * 0.2) * (0.4 + 0.6 * horizontal);
  return [
    a,
    { x: a.x + dx * 0.18, y: a.y + sag + Math.max(0, dy) * 0.25 },
    { x: b.x - dx * 0.18, y: b.y + sag + Math.max(0, -dy) * 0.25 },
    b,
  ];
}

const f = (n: number) => n.toFixed(1);

export function curvePath([p0, c1, c2, p3]: Curve): string {
  return `M${f(p0.x)} ${f(p0.y)}C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p3.x)} ${f(p3.y)}`;
}

export function cablePath(a: Point, b: Point): string {
  return curvePath(cableCurve(a, b));
}

/** Point on the curve at parameter t (0 = start, 1 = end). */
export function pointAt([p0, c1, c2, p3]: Curve, t: number): Point {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return { x: w0 * p0.x + w1 * c1.x + w2 * c2.x + w3 * p3.x, y: w0 * p0.y + w1 * c1.y + w2 * c2.y + w3 * p3.y };
}
