import { useEffect, useRef, useState } from "react";
import { createLifeApp } from "../app/bootstrap.js";
import type { LifeApp } from "../app/bootstrap.js";
import type { LifeSnapshot } from "../simulation/LifeModeAdapter.js";

export interface LifeHandle {
  snap: LifeSnapshot | null;
  app: LifeApp | null;
  selected: string | null;
  select(id: string | null): void;
  menu: { objectId: string; x: number; y: number } | null;
  closeMenu(): void;
}

export function useLife(): LifeHandle & {
  hostRef: React.RefObject<HTMLCanvasElement>;
} {
  const hostRef = useRef<HTMLCanvasElement>(null);
  const [snap, setSnap] = useState<LifeSnapshot | null>(null);
  const [app, setApp] = useState<LifeApp | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ objectId: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = hostRef.current;
    if (!canvas) return;
    const life = createLifeApp(canvas, {
      onAgentSelected: (id) => {
        setSelected(id);
        // NPC context menu opens with social options (Sprint 40).
        setMenu({ objectId: `agent:${id}`, x: window.innerWidth / 2 - 70,
                  y: Math.min(window.innerHeight - 190, window.innerHeight / 2 - 90) });
      },
      onObjectMenu: (objectId, x, y) =>
        setMenu(x >= 0 ? { objectId, x, y } : null),
      onBuiltMenu: (objectId, x, y) =>
        setMenu({ objectId: `built:${objectId}`, x, y }),
      onDismissMenu: () => setMenu(null),
    });
    setApp(life);

    const push = (): void => setSnap(life.adapter.snapshot());
    const unsub = life.adapter.subscribe(push);
    push();
    life.start();

    return () => { unsub(); life.dispose(); };
    // Scene callbacks read state through refs set by React on re-render.
  }, []);

  return {
    hostRef, snap, app, selected,
    select: setSelected,
    menu,
    closeMenu: () => setMenu(null),
  };
}
