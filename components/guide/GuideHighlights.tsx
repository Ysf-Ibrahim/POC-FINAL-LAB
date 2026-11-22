"use client";

import { useEffect, useRef } from "react";
import { cablePath } from "@/lib/cables/geometry";
import { cableStore } from "@/lib/cables/store";
import { resolveNets } from "@/lib/guide/bench";
import { highlightStore } from "@/lib/guide/store";
import { PORTS } from "@/lib/ports/registry";
import { useStore } from "@/lib/state/createStore";
import { on, portRadius, portWorld } from "@/lib/workspace/scene";

/** Matches a knob by its name and a switch by the start of its "name: position" label. */
const controlSelector = (name: string) => `.control[aria-label="${name}"], .control[aria-label^="${name}:"]`;

/**
 * Marks on the bench for the open guide step: a ring around each socket to
 * use, a dashed hint between the two sockets of a connection, and a glow on
 * the controls to adjust. Drawn in bench coordinates, so the marks stay on
 * their sockets through pan, zoom and instrument moves. Nothing here can be
 * clicked; the sockets underneath stay fully usable.
 */
export function GuideHighlights() {
  const spec = useStore(highlightStore, (s) => s);
  const cables = useStore(cableStore, (s) => s.cables);
  const layer = useRef<SVGSVGElement>(null);

  const valid = (p: [string, string]) => PORTS.has(p[0]) && PORTS.has(p[1]);
  const pairs = [...(spec.link ? [spec.link] : []), ...(spec.links ?? [])].filter(valid);
  const nets = resolveNets(cables);
  const joined = pairs.map((p) => nets.linked(p[0], p[1]));
  // Leads still to remove: only while the two sockets are still connected.
  const cuts = (spec.unlink ?? []).filter(valid).filter((p) => nets.linked(p[0], p[1]));
  const cutPorts = new Set(cuts.flat());
  const ids = [...new Set([...pairs.flat(), ...(spec.ports ?? [])])].filter((id) => PORTS.has(id) && !cutPorts.has(id));
  /** A socket is done when every connection it takes part in is made. */
  const done = (id: string) => {
    const mine = pairs.map((p, i) => (p.includes(id) ? joined[i] : null)).filter((x) => x !== null);
    return mine.length > 0 && mine.every(Boolean);
  };
  const hints = pairs.filter((_, i) => !joined[i]);
  const key = [...ids, "|", ...cutPorts, "|", ...hints.flat()].join(",");

  // Sockets and hints follow the instruments without re-rendering.
  useEffect(() => {
    const svg = layer.current;
    if (!svg) return;
    const place = () => {
      svg.querySelectorAll<SVGGElement>("[data-port]").forEach((g) => {
        const port = PORTS.get(g.dataset.port!);
        if (!port) return;
        const w = portWorld(port);
        g.setAttribute("transform", `translate(${w.x.toFixed(1)} ${w.y.toFixed(1)})`);
      });
      svg.querySelectorAll<SVGPathElement>("[data-hint]").forEach((path) => {
        const [a, b] = path.dataset.hint!.split(" ").map((id) => PORTS.get(id)!);
        path.setAttribute("d", cablePath(portWorld(a), portWorld(b)));
      });
    };
    place();
    const offs = [on("device", place), on("layout", place)];
    return () => offs.forEach((off) => off());
  }, [key]);

  // Controls live inside the instruments: mark the elements themselves.
  const controls = (spec.controls ?? []).join("|");
  useEffect(() => {
    if (!controls) return;
    const marked: HTMLElement[] = [];
    for (const name of controls.split("|")) {
      document.querySelectorAll<HTMLElement>(controlSelector(name)).forEach((el) => {
        el.dataset.guided = "true";
        marked.push(el);
      });
    }
    return () => marked.forEach((el) => delete el.dataset.guided);
  }, [controls]);

  return (
    <svg ref={layer} className="guide-layer" width={1} height={1} aria-hidden>
      {hints.map((p) => (
        <path key={p.join(" ")} data-hint={p.join(" ")} className="guide-hint" fill="none" />
      ))}
      {cuts.map((p) => (
        <path key={`cut ${p.join(" ")}`} data-hint={p.join(" ")} className="guide-hint is-cut" fill="none" />
      ))}
      {ids.map((id) => {
        const r = portRadius(PORTS.get(id)!) * 1.75 + 3;
        const isDone = done(id);
        return (
          <g key={id} data-port={id} className={`guide-ring ${isDone ? "is-done" : ""}`}>
            <circle className="guide-ring-halo" r={r} />
            <circle className="guide-ring-line" r={r} />
            {!isDone && <circle className="guide-ring-pulse" r={r} />}
          </g>
        );
      })}
      {[...cutPorts].map((id) => {
        const r = portRadius(PORTS.get(id)!) * 1.75 + 3;
        return (
          <g key={`cut ${id}`} data-port={id} className="guide-ring is-cut">
            <circle className="guide-ring-halo" r={r} />
            <circle className="guide-ring-line" r={r} />
          </g>
        );
      })}
    </svg>
  );
}
