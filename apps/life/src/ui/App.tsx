import { useEffect, useMemo, useState } from "react";
import { useLife } from "./useLife.js";
import {
  orderResidentRail, residentRailItemFromPresence,
} from "./models/residentView.js";
import { followedStories, liveStories, townStoryViews } from "./models/storyView.js";
import { TopBar } from "./components/TopBar.js";
import { ResidentRail } from "./components/ResidentRail.js";
import { ControlledResidentCard } from "./components/ControlledResidentCard.js";
import { ResidentDetails } from "./components/ResidentDetails.js";
import { ActionQueue } from "./components/ActionQueue.js";
import { ContextMenu } from "./components/ContextMenu.js";
import { TownObserver } from "./components/TownObserver.js";
import { PhonePanel } from "./components/PhonePanel.js";
import { WorldMap } from "./components/WorldMap.js";
import { BuildPanel } from "./components/BuildPanel.js";
import { ToastLayer } from "./components/ToastLayer.js";
import "./styles/tokens.css";
import "./styles/life.css";
import "./styles/components.css";

type SidePanel = "town" | "resident" | "phone" | null;

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
  const selectedKnowledge = useMemo(() =>
    app && snap && selected && controlledId
      ? app.adapter.residentKnowledgeFor(controlledId, selected) : undefined,
  [app, snap, selected, controlledId]);
  const controlledLife = useMemo(() =>
    app && snap && controlledId ? app.adapter.personalLifeFor(controlledId) : undefined,
  [app, snap, controlledId]);
  const selectedLife = useMemo(() =>
    app && snap && selected && app.player.canSwitchTo(selected)
      ? app.adapter.personalLifeFor(selected) : undefined,
  [app, snap, selected, controlledId]);

  const household = useMemo(() => new Set(app?.player.householdMembers() ?? []), [app, snap, controlledId]);
  const residentPresence = useMemo(() =>
    app && snap && controlledId ? app.adapter.residentPresenceFor(controlledId) : [],
  [app, snap, controlledId]);
  const names = useMemo(() => new Map((snap?.agents ?? []).map((agent) => [agent.id, agent.name])), [snap]);
  const locations = useMemo(() => new Map((snap?.locations ?? []).map((location) => [location.id, location.name])), [snap]);

  const residents = useMemo(() => orderResidentRail(
    residentPresence.map((presence) => residentRailItemFromPresence(presence, {
      controlled: presence.id === controlledId,
      household: household.has(presence.id),
      selected: presence.id === selected,
      followed: followed.has(presence.id),
    })),
  ), [residentPresence, controlledId, household, selected, followed]);

  const observerLive = useMemo(() => snap
    ? liveStories(snap.events, snap.time.totalMinutes, names, locations, 14, controlledId
      ? { id: controlledId, locationId: controlled?.summary.locationId } : undefined) : [],
  [snap, names, locations, controlledId, controlled?.summary.locationId]);
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
    <main className={`life-root${buildMode ? " is-build-mode" : ""}${panel ? " has-side-panel" : ""}`}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest("[data-context-menu='1']")) closeMenu();
      }}>
      <canvas ref={hostRef} className="life-canvas" aria-label="EchoSim town view" />

      <TopBar app={app} time={snap?.time}
        onPhone={() => setPanel((value) => value === "phone" ? null : "phone")}
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

          {panel === "phone" && controlledLife && snap && controlledId && (
            <PhonePanel
              key={controlledId}
              life={controlledLife}
              residents={snap.agents}
              names={names}
              locations={locations}
              nowMinutes={snap.time.totalMinutes}
              onSend={(toId, text) => {
                const sent = app?.adapter.sendMessage(controlledId, toId, text) ?? false;
                if (app) setFlash(app.adapter.lastCommandFeedback);
                return sent;
              }}
              onRespond={(invitationId, response) => {
                app?.adapter.respondToInvitation(controlledId, invitationId, response);
                if (app) setFlash(app.adapter.lastCommandFeedback);
              }}
              onClose={() => setPanel(null)} />
          )}

          {panel === "town" && (
            <TownObserver
              live={observerLive}
              town={observerTown}
              following={observerFollowing}
              names={names}
              followedCount={followed.size}
              locations={snap?.locations ?? []}
              agents={snap?.agents ?? []}
              currentLocationId={controlled?.summary.locationId}
              selectedLocationId={selectedAgent?.summary.locationId}
              onOpenMap={() => setShowMap(true)}
              onClose={() => setPanel(null)} />
          )}

          {panel === "resident" && selectedAgent && selected && selectedKnowledge && (
            <ResidentDetails
              key={selected}
              agent={selectedAgent}
              names={names}
              locations={locations}
              knowledge={selectedKnowledge}
              life={selectedLife}
              nowMinutes={snap?.time.totalMinutes ?? 0}
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
