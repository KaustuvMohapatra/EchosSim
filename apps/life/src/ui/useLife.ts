import { useEffect, useRef, useState } from "react";
import { createLifeApp } from "../app/bootstrap.js";
import type { LifeApp } from "../app/bootstrap.js";
import type { LifeSnapshot } from "../simulation/LifeModeAdapter.js";

export function useLife(): {
  hostRef: React.RefObject<HTMLCanvasElement>;
  snap: LifeSnapshot | null;
  app: LifeApp | null;
} {
  const hostRef = useRef<HTMLCanvasElement>(null);
  const [snap, setSnap] = useState<LifeSnapshot | null>(null);
  const [app, setApp] = useState<LifeApp | null>(null);

  useEffect(() => {
    const canvas = hostRef.current;
    if (!canvas) return;
    const life = createLifeApp(canvas);
    setApp(life);

    const push = (): void => setSnap(life.adapter.snapshot());
    const unsub = life.adapter.subscribe(push);
    push();
    life.start();

    return () => { unsub(); life.dispose(); };
  }, []);

  return { hostRef, snap, app };
}
