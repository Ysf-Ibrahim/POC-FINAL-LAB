"use client";

import { useEffect, useState } from "react";
import { cableStore } from "@/lib/cables/store";
import { controlsStore } from "@/lib/controls/store";
import { Bench } from "@/lib/guide/bench";
import { scopeStatus } from "@/lib/sim/status";

const snapshot = () => new Bench(cableStore.get().cables, controlsStore.get(), scopeStatus.get());

/**
 * The bench as it is now, for evaluating a guide's checks. Re-read shortly
 * after any lead, control or trigger change (not on every frame of a drag).
 */
export function useBench(): Bench {
  const [bench, setBench] = useState(snapshot);
  useEffect(() => {
    let timer = 0;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setBench(snapshot()), 70);
    };
    refresh();
    const offs = [cableStore.subscribe(refresh), controlsStore.subscribe(refresh), scopeStatus.subscribe(refresh)];
    return () => {
      window.clearTimeout(timer);
      offs.forEach((off) => off());
    };
  }, []);
  return bench;
}
