import { useEffect, useRef, useState } from "react";
import { createLifeApp } from "../app/bootstrap.js";
import type { LifeApp } from "../app/bootstrap.js";
import type { LifeSnapshot } from "../simulation/LifeModeAdapter.js";

export interface LifeHandle {
  snap: LifeSnapshot | null;
  app: LifeApp | null;
  selected: string | null;
  select(id: string | null): void;
}

export function useLife(): LifeHandle & {
  hostRef: React.RefObject<HTMLCanvasElement>;
} {
  const hostRef = useRef<HTMLCanvasElement>(null);
  const [snap, setSnap] = useState<LifeSnapshot | null>(null);
  const [app, setApp] = useState<LifeApp | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    const canvas = hostRef.current;
    if (!canvas) return;
    const life = createLifeApp(canvas, {
      onAgentSelected: (id) => setSelected(id),
    });
    setApp(life);

    const push = (): void => setSnap(life.adapter.snapshot());
    const unsub = life.adapter.subscribe(push);
    push();
    life.start();

    return () => { unsub(); life.dispose(); };
    // Selection is read through a ref inside scene callbacks.
  }, []);

  return { hostRef, snap, app, selected, select: setSelected };
}
