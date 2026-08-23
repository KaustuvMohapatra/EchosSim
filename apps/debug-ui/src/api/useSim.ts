import { useEffect, useMemo, useState } from "react";
import { SimHost } from "../sim/SimHost.js";
import type { UiSnapshot } from "../sim/SimHost.js";

/** Single React entry into simulation state: read-only snapshots on change. */
export function useSim(seed: bigint) {
  const host = useMemo(() => new SimHost(seed), [seed]);
  const [selectedId, setSelectedId] = useState<string | undefined>("npc_mira");
  const [, setVersion] = useState(0);

  useEffect(() => {
    const unsub = host.subscribe(() => setVersion((v) => v + 1));
    return () => { unsub(); host.dispose(); };
  }, [host]);

  const snap: UiSnapshot = host.snapshot(selectedId);
  return { host, snap, selectedId, setSelectedId };
}
