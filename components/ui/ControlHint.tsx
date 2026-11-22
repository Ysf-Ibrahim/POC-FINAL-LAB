"use client";

import { useSyncExternalStore } from "react";
import { hint } from "@/lib/ui/hint";

/** Value bubble for the control under the pointer; lives outside the zoomed bench so it stays legible. */
export function ControlHint() {
  const h = useSyncExternalStore(hint.subscribe, hint.get, () => null);
  if (!h) return null;
  return (
    <div className="hint" role="status" style={{ left: h.x, top: h.y }}>
      {h.text}
    </div>
  );
}
