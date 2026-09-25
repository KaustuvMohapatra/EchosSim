import type { CSSProperties } from "react";
import type { AgentSummary } from "@echosim/inspector";
import type { LifeLocationSummary } from "../../simulation/LifeModeAdapter.js";
import { mapLots } from "../../world/map.js";
import { residentCountsByLocation } from "../models/townView.js";

interface TownMiniMapProps {
  locations: readonly LifeLocationSummary[];
  agents: readonly AgentSummary[];
  currentLocationId?: string;
  selectedLocationId?: string;
}

/** Compact preview of the same authored lots used by the expanded map. */
export function TownMiniMap({
  locations, agents, currentLocationId, selectedLocationId,
}: TownMiniMapProps) {
  const locationsById = new Map(locations.map((location) => [location.id, location]));
  const residentCounts = residentCountsByLocation(agents);
  return (
    <div className="town-mini-map" aria-label="Compact town preview">
      <span className="town-mini-map__river" aria-hidden="true" />
      {mapLots().map((lot) => {
        const location = locationsById.get(lot.locationId);
        const residentCount = residentCounts.get(lot.locationId) ?? 0;
        const style = {
          left: `${lot.x * 100}%`,
          top: `${lot.z * 100}%`,
          width: `${Math.max(5, lot.width * 100)}%`,
          height: `${Math.max(7, lot.depth * 100)}%`,
          "--mini-tint": lot.district?.tint ?? "#8ea29c",
        } as CSSProperties;
        return (
          <i key={lot.locationId} style={style}
            className={[
              "town-mini-map__lot",
              lot.locationId === currentLocationId ? "is-current" : "",
              lot.locationId === selectedLocationId ? "is-selected" : "",
              location?.isOpen === false ? "is-closed" : "",
              residentCount > 0 ? "is-active" : "",
            ].filter(Boolean).join(" ")}
            title={[
              location?.name ?? lot.locationId,
              location?.isOpen === false ? "Closed" : "Open",
              residentCount > 0
                ? `${residentCount} resident${residentCount === 1 ? "" : "s"} here`
                : "No residents here",
            ].join(" · ")}>
            {residentCount > 0 && <b>{residentCount}</b>}
          </i>
        );
      })}
    </div>
  );
}
