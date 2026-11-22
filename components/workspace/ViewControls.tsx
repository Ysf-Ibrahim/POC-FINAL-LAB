"use client";

import { useSyncExternalStore } from "react";
import { fitToScreen, resetLayout, zoomByStep } from "@/lib/workspace/motion";
import { on, scene } from "@/lib/workspace/scene";

const subscribe = (fn: () => void) => on("view", fn);
const zoomPercent = () => Math.round(scene.view.k * 100);

/** Zoom and layout controls, bottom-right of the bench. */
export function ViewControls() {
  const zoom = useSyncExternalStore(subscribe, zoomPercent, () => 100);
  return (
    <div className="viewbar" role="group" aria-label="View">
      <button type="button" className="tool" aria-label="Zoom out" title="Zoom out (−)" onClick={() => zoomByStep(-1)}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <path d="M3.5 8h9" />
        </svg>
      </button>
      <button type="button" className="zoom-value" title="Fit to screen (0)" aria-label={`Zoom ${zoom} percent. Fit to screen`} onClick={fitToScreen}>
        {zoom}%
      </button>
      <button type="button" className="tool" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomByStep(1)}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <path d="M3.5 8h9M8 3.5v9" />
        </svg>
      </button>
      <span className="tool-sep is-vertical" />
      <button type="button" className="text-tool" title="Put the equipment back in its original layout" onClick={resetLayout}>
        Reset layout
      </button>
    </div>
  );
}
