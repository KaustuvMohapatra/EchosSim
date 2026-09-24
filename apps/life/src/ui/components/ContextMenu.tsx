import type { CSSProperties } from "react";
import { SocialActionType } from "@echosim/social";
import type { LifeApp } from "../../app/bootstrap.js";
import type { LifeSnapshot } from "../../simulation/LifeModeAdapter.js";
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
  snap: LifeSnapshot | null;
  onClose(): void;
  onFlash(text: string): void;
}

export function ContextMenu({ menu, app, snap, onClose, onFlash }: ContextMenuProps) {
  const style: CSSProperties = typeof window === "undefined" ? {} : {
    left: Math.max(12, Math.min(menu.x, window.innerWidth - 260)),
    top: Math.max(76, Math.min(menu.y, window.innerHeight - 360)),
  };

  if (menu.objectId.startsWith("agent:")) {
    const targetId = menu.objectId.slice(6);
    const summary = snap?.agents.find((s) => s.id === targetId);
    const controlled = app.player.controlled;
    const coLocated = summary?.locationId === app.adapter.playerLocationId(controlled);
    const relation = app.adapter.inspector.getRelationships(controlled)
      .find((r) => r.to === targetId);
    const relationship = relation ? cleanRelationshipLabel(relation.label) : "Stranger";
    return (
      <div className="context-menu" style={style} data-context-menu="1" role="menu">
        <div className="context-menu__head">
          <span>
            <small>{relationship}</small>
            <strong>{summary?.name ?? targetId}</strong>
          </span>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close menu">×</button>
        </div>
        {coLocated ? SOCIAL_ITEMS.map(([label, action]) => (
          <button type="button" role="menuitem" key={label} data-context-menu="1"
            onClick={() => {
              app.player.enqueueSocial(targetId, summary?.name ?? targetId, action);
              onClose();
            }}>
            <span>{label}</span><small>{summary?.locationName ?? "Nearby"}</small>
          </button>
        )) : (
          <button type="button" role="menuitem" data-context-menu="1"
            disabled={!summary?.locationId}
            onClick={() => {
              if (summary?.locationId) {
                app.player.enqueueVisitAndSocial(
                  targetId, summary.name, SocialActionType.Greet,
                  summary.locationId, summary.locationName ?? summary.locationId,
                );
                onFlash(`Heading over to ${summary.name}.`);
              }
              onClose();
            }}>
            <span>Walk over &amp; Greet</span><small>{summary?.locationName ?? "Location unavailable"}</small>
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
