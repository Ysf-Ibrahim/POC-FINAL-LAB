"use client";

import { CABLE_COLORS, cableActions, cableStore, type CableColor } from "@/lib/cables/store";
import { useStore } from "@/lib/state/createStore";
import { CABLE_PALETTE } from "./CableLayer";

const COLOR_NAMES: Record<CableColor, string> = { red: "Red", black: "Black", blue: "Blue" };

const icon = {
  width: 18,
  height: 18,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** Patch-lead tools, docked on the left edge of the bench. */
export function WireToolbar() {
  const color = useStore(cableStore, (s) => s.color);
  const tool = useStore(cableStore, (s) => s.tool);
  const count = useStore(cableStore, (s) => s.cables.length);
  const canUndo = useStore(cableStore, (s) => s.past.length > 0);

  return (
    <div className="toolbar" role="toolbar" aria-label="Patch leads" aria-orientation="vertical">
      {CABLE_COLORS.map((c) => {
        const active = tool === "wire" && color === c;
        return (
          <button
            key={c}
            type="button"
            className={`tool ${active ? "is-active" : ""}`}
            aria-pressed={active}
            aria-label={`${COLOR_NAMES[c]} cable`}
            title={`${COLOR_NAMES[c]} cable`}
            onClick={() => cableActions.setColor(c)}
          >
            <span className="swatch" style={{ background: CABLE_PALETTE[c].body, borderColor: CABLE_PALETTE[c].edge }} />
          </button>
        );
      })}
      <span className="tool-sep" />
      <button
        type="button"
        className={`tool ${tool === "remove" ? "is-active is-danger" : ""}`}
        aria-pressed={tool === "remove"}
        aria-label="Remove cable"
        title="Remove cable — click a cable or a socket"
        onClick={() => cableActions.setTool(tool === "remove" ? "wire" : "remove")}
      >
        {/* a plug pulled from its socket */}
        <svg {...icon}>
          <path d="M4 16l3.2-3.2" />
          <path d="M6.3 10.2l3.5 3.5 1.6-1.6a2.5 2.5 0 0 0 0-3.5 2.5 2.5 0 0 0-3.5 0z" />
          <path d="M12.5 7.5l1.6-1.6M14.6 9.6l1.6-1.6" />
          <path d="M14 3l3 3" opacity="0.55" />
        </svg>
      </button>
      <button
        type="button"
        className="tool"
        aria-label="Clear cables"
        title="Clear all cables"
        disabled={count === 0}
        onClick={() => cableActions.clear()}
      >
        <svg {...icon}>
          <path d="M4.5 6h11M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6" />
          <path d="M8.6 8.6v4.6M11.4 8.6v4.6" />
        </svg>
      </button>
      <button
        type="button"
        className="tool"
        aria-label="Undo"
        title="Undo (Ctrl/⌘ Z)"
        disabled={!canUndo}
        onClick={() => cableActions.undo()}
      >
        <svg {...icon}>
          <path d="M7.5 5L4 8.5 7.5 12" />
          <path d="M4.5 8.5h7a4 4 0 0 1 0 8H9" />
        </svg>
      </button>
    </div>
  );
}
