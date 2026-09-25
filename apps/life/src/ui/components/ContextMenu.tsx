import type { CSSProperties } from "react";
import { SocialActionType } from "@echosim/social";
import type { LifeApp } from "../../app/bootstrap.js";
import { cleanRelationshipLabel } from "../models/residentView.js";

export interface ContextMenuState { objectId: string; x: number; y: number }

const SOCIAL_ITEMS: readonly [string, SocialActionType][] = [
  ["Greet", SocialActionType.Greet],
  ["Talk", SocialActionType.Chat],
  ["Compliment", SocialActionType.Compliment],
  ["Tease", SocialActionType.Tease],
  ["Help", SocialActionType.Help],
  ["Apologize", SocialActionType.Apologize],
];

interface ContextMenuProps {
  menu: ContextMenuState;
  app: LifeApp;
  onClose(): void;
  onFlash(text: string): void;
}

export function ContextMenu({ menu, app, onClose, onFlash }: ContextMenuProps) {
  const style: CSSProperties = typeof window === "undefined" ? {} : {
    left: Math.max(12, Math.min(menu.x, window.innerWidth - 260)),
    top: Math.max(76, Math.min(menu.y, window.innerHeight - 360)),
  };

  if (menu.objectId.startsWith("agent:")) {
    const targetId = menu.objectId.slice(6);
    const controlled = app.player.controlled;
    const presence = app.adapter.residentPresenceFor(controlled)
      .find((resident) => resident.id === targetId);
    const summary = presence?.current;
    const targetName = presence?.name ?? targetId;
    const coLocated = summary?.locationId === app.adapter.playerLocationId(controlled);
    const relation = app.adapter.inspector.getRelationships(controlled)
      .find((r) => r.to === targetId);
    const relationship = relation ? cleanRelationshipLabel(relation.label) : "Stranger";
    return (
      <div className="context-menu" style={style} data-context-menu="1" role="menu">
        <div className="context-menu__head">
          <span>
            <small>{relationship}</small>
            <strong>{targetName}</strong>
          </span>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close menu">×</button>
        </div>
        {coLocated ? SOCIAL_ITEMS.map(([label, action]) => (
          <button type="button" role="menuitem" key={label} data-context-menu="1"
            onClick={() => {
              app.player.enqueueSocial(targetId, targetName, action);
              onClose();
            }}>
            <span>{label}</span><small>{summary?.locationName ?? "Nearby"}</small>
          </button>
        )) : presence?.visibility === "current" && summary?.locationId ? (
          <button type="button" role="menuitem" data-context-menu="1"
            onClick={() => {
              app.player.enqueueVisitAndSocial(
                targetId, targetName, SocialActionType.Greet,
                summary.locationId, summary.locationName ?? summary.locationId,
              );
              onFlash(`Heading over to ${targetName}.`);
              onClose();
            }}>
            <span>Walk over &amp; Greet</span>
            <small>{summary.locationName ?? summary.locationId}</small>
          </button>
        ) : presence?.visibility === "last-known" && presence.lastKnownLocationId ? (
          <button type="button" role="menuitem" data-context-menu="1"
            onClick={() => {
              const locationName = presence.lastKnownLocationName ??
                presence.lastKnownLocationId!;
              app.player.enqueueMove(presence.lastKnownLocationId!, locationName);
              onFlash(`Heading to where ${targetName} was last seen.`);
              onClose();
            }}>
            <span>Visit last seen place</span>
            <small>{presence.lastKnownLocationName ?? presence.lastKnownLocationId}</small>
          </button>
        ) : (
          <button type="button" role="menuitem" data-context-menu="1" disabled>
            <span>Location unknown</span><small>Find them around town first</small>
          </button>
        )}
      </div>
    );
  }

  if (menu.objectId.startsWith("built:")) {
    const objectId = menu.objectId.slice(6);
    return (
      <div className="context-menu" style={style} data-context-menu="1" role="menu">
        <div className="context-menu__head"><strong>Furniture</strong></div>
        <button type="button" role="menuitem" data-context-menu="1"
          onClick={() => { app.build.rotate(objectId); onClose(); }}>Rotate</button>
        <button type="button" role="menuitem" className="is-danger" data-context-menu="1"
          onClick={() => {
            if (app.build.remove(objectId)) onFlash("Furniture removed.");
            onClose();
          }}>Delete</button>
      </div>
    );
  }

  const object = app.interactions.objectDef(menu.objectId);
  return (
    <div className="context-menu" style={style} data-context-menu="1" role="menu">
      <div className="context-menu__head">
        <strong>{object?.objectId.replace(/_/g, " ") ?? "Object"}</strong>
      </div>
      {app.interactions.affordancesOf(menu.objectId).map((affordance) => (
        <button type="button" role="menuitem" key={affordance.id} data-context-menu="1"
          onClick={() => {
            const result = app.interactions.use(menu.objectId, affordance.id);
            if (result.feedback) onFlash(result.feedback);
            onClose();
          }}>
          {affordance.label}
        </button>
      ))}
    </div>
  );
}
