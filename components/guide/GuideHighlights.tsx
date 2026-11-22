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

  const linkPorts: string[] = spec.link ?? [];
  const ids = [...new Set([...linkPorts, ...(spec.ports ?? [])])].filter((id) => PORTS.has(id));
  const linked = spec.link ? resolveNets(cables).linked(spec.link[0], spec.link[1]) : false;
  const key = ids.join("|");
  const link = spec.link && PORTS.has(spec.link[0]) && PORTS.has(spec.link[1]) ? spec.link : null;

  // Sockets: follow the instruments without re-rendering.
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
      const hint = svg.querySelector<SVGPathElement>("[data-hint]");
      if (hint && link) hint.setAttribute("d", cablePath(portWorld(PORTS.get(link[0])!), portWorld(PORTS.get(link[1])!)));
    };
    place();
    const offs = [on("device", place), on("layout", place)];
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, link?.[0], link?.[1], linked]);

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
      {link && !linked && <path data-hint className="guide-hint" fill="none" />}
      {ids.map((id) => {
        const r = portRadius(PORTS.get(id)!) * 1.75 + 3;
        const done = linked && linkPorts.includes(id);
        return (
          <g key={id} data-port={id} className={`guide-ring ${done ? "is-done" : ""}`}>
            <circle className="guide-ring-halo" r={r} />
            <circle className="guide-ring-line" r={r} />
            {!done && <circle className="guide-ring-pulse" r={r} />}
          </g>
        );
      })}
    </svg>
  );
}
