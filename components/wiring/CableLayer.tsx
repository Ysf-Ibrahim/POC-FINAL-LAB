"use client";

import { memo, useEffect, useLayoutEffect, useRef } from "react";
import { cablePath } from "@/lib/cables/geometry";
import { cableActions, cableStore, type Cable, type CableColor } from "@/lib/cables/store";
import { wiring } from "@/lib/cables/wiring";
import { PORTS } from "@/lib/ports/registry";
import type { PortDef } from "@/lib/ports/types";
import { useStore } from "@/lib/state/createStore";
import { on, portRadius, portWorld } from "@/lib/workspace/scene";

export const CABLE_PALETTE: Record<CableColor, { body: string; edge: string; light: string }> = {
  red: { body: "#cc3a30", edge: "#8a1f18", light: "#ee8f86" },
  black: { body: "#2d2d31", edge: "#0f0f11", light: "#77777f" },
  blue: { body: "#2c6bcb", edge: "#18428c", light: "#8fb6f0" },
};
/** Pale rim that keeps a black lead readable against the black trainer panel. */
const RIM = "rgba(214,216,222,0.5)";

/** Functions that re-route one cable from live scene geometry, keyed by cable id. */
type Rerouters = Map<string, () => void>;

const at = (p: { x: number; y: number }) => `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`;

/** Top view of a 2 mm stackable plug. */
function Plug({ port, color }: { port: PortDef; color: CableColor }) {
  const c = CABLE_PALETTE[color];
  const r = port.kind === "post" ? 7 : portRadius(port) * 0.8;
  return (
    <>
      {color === "black" && <circle r={r + 0.9} fill={RIM} />}
      <circle r={r} fill={c.body} stroke={c.edge} strokeWidth={1.1} />
      <circle r={r * 0.36} fill={c.edge} />
      <path
        d={`M${(-r * 0.62).toFixed(2)} ${(-r * 0.2).toFixed(2)}A${(r * 0.66).toFixed(2)} ${(r * 0.66).toFixed(2)} 0 0 1 ${(r * 0.2).toFixed(2)} ${(-r * 0.62).toFixed(2)}`}
        fill="none"
        stroke={c.light}
        strokeWidth={1}
        strokeLinecap="round"
        opacity={0.75}
      />
    </>
  );
}

const CableView = memo(function CableView({
  cable,
  selected,
  rerouters,
}: {
  cable: Cable;
  selected: boolean;
  rerouters: Rerouters;
}) {
  const group = useRef<SVGGElement>(null);
  const plugA = useRef<SVGGElement>(null);
  const plugB = useRef<SVGGElement>(null);
  const a = PORTS.get(cable.a)!;
  const b = PORTS.get(cable.b)!;
  const c = CABLE_PALETTE[cable.color];

  useLayoutEffect(() => {
    const route = () => {
      const pa = portWorld(a);
      const pb = portWorld(b);
      const d = cablePath(pa, pb);
      group.current?.querySelectorAll<SVGPathElement>("path[data-route]").forEach((p) => p.setAttribute("d", d));
      plugA.current?.setAttribute("transform", at(pa));
      plugB.current?.setAttribute("transform", at(pb));
    };
    route();
    rerouters.set(cable.id, route);
    return () => {
      rerouters.delete(cable.id);
    };
  }, [a, b, cable.id, rerouters]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (cableStore.get().tool === "remove") cableActions.remove(cable.id);
    else cableActions.select(cableStore.get().selected === cable.id ? null : cable.id);
  };

  return (
    <g ref={group} data-cable={cable.id} data-a={cable.a} data-b={cable.b} className="cable">
      <path data-route fill="none" stroke="rgba(20,20,24,0.16)" strokeWidth={6.5} strokeLinecap="round" transform="translate(1.5 3)" />
      {selected && <path data-route fill="none" stroke="var(--accent)" strokeWidth={10} strokeLinecap="round" opacity={0.45} />}
      {cable.color === "black" && <path data-route fill="none" stroke={RIM} strokeWidth={6.4} strokeLinecap="round" />}
      <path data-route fill="none" stroke={c.edge} strokeWidth={5.4} strokeLinecap="round" />
      <path data-route fill="none" stroke={c.body} strokeWidth={3.8} strokeLinecap="round" />
      <path data-route fill="none" stroke={c.light} strokeWidth={1} strokeLinecap="round" opacity={0.4} transform="translate(-0.6 -0.9)" />
      <g ref={plugA}>
        <Plug port={a} color={cable.color} />
      </g>
      <g ref={plugB}>
        <Plug port={b} color={cable.color} />
      </g>
      <path
        data-route
        className="cable-hit"
        fill="none"
        stroke="transparent"
        strokeWidth={15}
        strokeLinecap="round"
        pointerEvents="stroke"
        onPointerDown={onPointerDown}
      />
    </g>
  );
});

/** Lead being routed and the socket highlight; both follow the pointer without React renders. */
function PendingWire() {
  const group = useRef<SVGGElement>(null);
  const ring = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const draw = () => {
      const g = group.current;
      const r = ring.current;
      if (!g || !r) return;
      const p = wiring.pending;
      const hoverId = p?.snap ?? wiring.hover;
      const hoverPort = hoverId ? PORTS.get(hoverId) : undefined;
      if (hoverPort) {
        const w = portWorld(hoverPort);
        r.setAttribute("cx", w.x.toFixed(1));
        r.setAttribute("cy", w.y.toFixed(1));
        r.setAttribute("r", (portRadius(hoverPort) * 1.22).toFixed(1));
        r.style.display = "";
      } else {
        r.style.display = "none";
      }
      if (!p) {
        g.style.display = "none";
        return;
      }
      const from = PORTS.get(p.from);
      if (!from) return;
      const start = portWorld(from);
      const snapPort = p.snap ? PORTS.get(p.snap) : undefined;
      const end = snapPort ? portWorld(snapPort) : p.end;
      const d = cablePath(start, end);
      const color = CABLE_PALETTE[cableStore.get().color];
      g.style.display = "";
      const [edge, body, startDot, endDot] = Array.from(g.children) as SVGElement[];
      edge.setAttribute("d", d);
      edge.setAttribute("stroke", color.edge);
      body.setAttribute("d", d);
      body.setAttribute("stroke", color.body);
      startDot.setAttribute("transform", at(start));
      startDot.setAttribute("fill", color.body);
      startDot.setAttribute("stroke", color.edge);
      endDot.setAttribute("transform", at(end));
      endDot.setAttribute("fill", color.body);
      endDot.setAttribute("stroke", color.edge);
    };
    draw();
    const offWiring = wiring.subscribe(draw);
    const offDevice = on("device", draw);
    const offStore = cableStore.subscribe(draw);
    return () => {
      offWiring();
      offDevice();
      offStore();
    };
  }, []);

  return (
    <>
      <g ref={group} style={{ display: "none" }} opacity={0.92}>
        <path fill="none" strokeWidth={5.4} strokeLinecap="round" />
        <path fill="none" strokeWidth={3.8} strokeLinecap="round" />
        <circle r={5.6} strokeWidth={1.1} />
        <circle r={5.6} strokeWidth={1.1} />
      </g>
      <circle ref={ring} className="port-ring" fill="none" stroke="var(--accent)" strokeWidth={2} style={{ display: "none" }} />
    </>
  );
}

export function CableLayer() {
  const cables = useStore(cableStore, (s) => s.cables);
  const selected = useStore(cableStore, (s) => s.selected);
  const tool = useStore(cableStore, (s) => s.tool);
  const rerouters = useRef<Rerouters>(new Map()).current;

  useEffect(() => {
    const reroute = (deviceId?: string) => {
      for (const cable of cableStore.get().cables) {
        if (!deviceId || PORTS.get(cable.a)?.device === deviceId || PORTS.get(cable.b)?.device === deviceId) {
          rerouters.get(cable.id)?.();
        }
      }
    };
    const offDevice = on("device", reroute);
    const offLayout = on("layout", () => reroute());
    return () => {
      offDevice();
      offLayout();
    };
  }, [rerouters]);

  return (
    <svg className={`cable-layer ${tool === "remove" ? "is-removing" : ""}`} width={1} height={1} aria-label={`${cables.length} patch leads`}>
      {cables.map((cable) => (
        <CableView key={cable.id} cable={cable} selected={selected === cable.id} rerouters={rerouters} />
      ))}
      <PendingWire />
    </svg>
  );
}
