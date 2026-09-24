import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createLifeApp, type LifeApp } from "../app/bootstrap.js";
import type { LifeSnapshot } from "../simulation/LifeModeAdapter.js";

export interface MenuState { objectId: string; x: number; y: number }

export interface LifeHandle {
  hostRef: RefObject<HTMLCanvasElement | null>;
  app: LifeApp | null;
  snap: LifeSnapshot | null;
}

export function useLife(): LifeHandle & {
  selected: string | null;
  select(id: string | null): void;
  menu: MenuState | null;
  closeMenu(): void;
  feedback: string | null;
  clearFeedback(): void;
} {
  const hostRef = useRef<HTMLCanvasElement | null>(null);
  const [app, setApp] = useState<LifeApp | null>(null);
  const [snap, setSnap] = useState<LifeSnapshot | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const canvas = hostRef.current;
    if (!canvas) return;
    const life = createLifeApp(canvas, {
      onAgentSelected: (agentId) => {
        setSelected(agentId);
        setMenu({ objectId: `agent:${agentId}`, x: innerWidth / 2, y: innerHeight / 2 });
      },
      onObjectMenu: (objectId, x, y) => setMenu(x >= 0 ? { objectId, x, y } : null),
      onBuiltMenu: (objectId, x, y) => setMenu({ objectId: `built:${objectId}`, x, y }),
      onDismissMenu: () => setMenu(null),
      onBuildFeedback: (text) => setFeedback(text || null),
    });
    setApp(life);
    setSnap(life.adapter.snapshot());
    const unsubscribe = life.adapter.subscribe(() => setSnap(life.adapter.snapshot()));
    life.start();
    return () => {
      unsubscribe();
      life.dispose();
      setApp(null);
    };
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);
  const clearFeedback = useCallback(() => setFeedback(null), []);
  return {
    hostRef, app, snap, selected, select: setSelected,
    menu, closeMenu, feedback, clearFeedback,
  };
}
