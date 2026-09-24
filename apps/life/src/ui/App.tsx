import { useEffect, useMemo, useState } from "react";
import { useLife } from "./useLife.js";
import { residentRailItem } from "./models/residentView.js";
import { followedStories, liveStories, townStoryViews } from "./models/storyView.js";
import { TopBar } from "./components/TopBar.js";
import { ResidentRail } from "./components/ResidentRail.js";
import { ControlledResidentCard } from "./components/ControlledResidentCard.js";
import { ResidentDetails } from "./components/ResidentDetails.js";
import { ActionQueue } from "./components/ActionQueue.js";
import { ContextMenu } from "./components/ContextMenu.js";
import { TownObserver } from "./components/TownObserver.js";
import { WorldMap } from "./components/WorldMap.js";
import { BuildPanel } from "./components/BuildPanel.js";
import { ToastLayer } from "./components/ToastLayer.js";
import "./styles/tokens.css";
import "./styles/life.css";
import "./styles/components.css";

type SidePanel = "town" | "resident" | null;

export function App() {
  const life = useLife();
  const { hostRef, snap, app, selected, menu, closeMenu } = life;
  const [panel, setPanel] = useState<SidePanel>(null);
  const [showMap, setShowMap] = useState(false);
  const [followed, setFollowed] = useState<Set<string>>(() => new Set());
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!life.feedback) return;
    setFlash(life.feedback);
    life.clearFeedback();
  }, [life.feedback, life.clearFeedback]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 2600);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const controlledId = app?.player.controlled;
  const controlled = controlledId && app
    ? app.adapter.inspector.getAgent(controlledId) : undefined;
  const selectedAgent = selected && app
    ? app.adapter.inspector.getAgent(selected) : undefined;

  const household = useMemo(() => new Set(app?.player.householdMembers() ?? []), [app, snap, controlledId]);
  const names = useMemo(() => new Map((snap?.agents ?? []).map((agent) => [agent.id, agent.name])), [snap]);
  const locations = useMemo(() => new Map((snap?.locations ?? []).map((location) => [location.id, location.name])), [snap]);

  const residents = useMemo(() => (snap?.agents ?? []).map((agent) => residentRailItem(agent, {
    controlled: agent.id === controlledId,
    household: household.has(agent.id),
    selected: agent.id === selected,
    followed: followed.has(agent.id),
  })), [snap, controlledId, household, selected, followed]);

  const observerLive = useMemo(() => snap
    ? liveStories(snap.events, snap.time.totalMinutes, names, locations, 14, controlledId) : [],
  [snap, names, locations, controlledId]);
  const observerTown = useMemo(() => app && snap && controlledId
    ? townStoryViews(app.adapter.townStoriesFor(controlledId), snap.time.day) : [],
  [app, snap, controlledId]);
  const observerFollowing = useMemo(() =>
    followedStories([...observerLive, ...observerTown], followed).slice(0, 14),
  [observerLive, observerTown, followed]);

  const destinationId = useMemo(() => {
    const item = app?.player.items().find((queued) =>
      queued.command.type === "move" &&
      (queued.status === "pending" || queued.status === "walking"));
    return item?.command.type === "move" ? item.command.locationId : undefined;
  }, [app, snap]);

  const toggleFollow = (id: string): void => {
    setFollowed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectResident = (id: string): void => {
    life.select(id);
    setPanel("resident");
  };
  const controlResident = (id: string): void => {
    if (!app?.player.switchTo(id)) return;
    life.select(id);
    setPanel("resident");
    setFlash(`Now controlling ${names.get(id) ?? "this resident"}.`);
  };

  const buildMode = app?.buildMode ?? false;

  return (
    <main className={`life-root${buildMode ? " is-build-mode" : ""}`}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest("[data-context-menu='1']")) closeMenu();
      }}>
      <canvas ref={hostRef} className="life-canvas" aria-label="EchoSim town view" />

      <TopBar app={app} time={snap?.time}
        onTown={() => setPanel((value) => value === "town" ? null : "town")}
        onMap={() => setShowMap(true)} />

      {!buildMode && (
        <>
          <ResidentRail residents={residents} onSelect={selectResident} onControl={controlResident} />
          <ControlledResidentCard agent={controlled}
            onProfile={() => {
              if (controlledId) life.select(controlledId);
              setPanel("resident");
            }} />
          <ActionQueue app={app} />

          {panel === "town" && (
            <TownObserver
              live={observerLive}
              town={observerTown}
              following={observerFollowing}
              names={names}
              followedCount={followed.size}
              currentLocationId={controlled?.summary.locationId}
              selectedLocationId={selectedAgent?.summary.locationId}
              onOpenMap={() => setShowMap(true)}
              onClose={() => setPanel(null)} />
          )}

          {panel === "resident" && selectedAgent && selected && (
            <ResidentDetails
              agent={selectedAgent}
              names={names}
              locations={locations}
              controlled={selected === controlledId}
              canControl={app?.player.canSwitchTo(selected) ?? false}
              followed={followed.has(selected)}
              onControl={() => controlResident(selected)}
              onFollow={() => toggleFollow(selected)}
              onClose={() => setPanel(null)} />
          )}
        </>
      )}

      {buildMode && app && <BuildPanel app={app} feedback={flash ?? undefined} />}

      {showMap && snap && (
        <WorldMap
          locations={snap.locations}
          agents={snap.agents}
          controlledId={controlledId}
          selectedId={selected ?? undefined}
          destinationId={destinationId}
          onTravel={(id, name) => {
            app?.player.enqueueMove(id, name);
            setFlash(`Travel queued: ${name}.`);
            setShowMap(false);
          }}
          onClose={() => setShowMap(false)} />
      )}

      {menu && app && (
        <ContextMenu menu={menu} app={app} snap={snap}
          onClose={closeMenu} onFlash={setFlash} />
      )}

      {!buildMode && <ToastLayer message={flash} />}
    </main>
  );
}
