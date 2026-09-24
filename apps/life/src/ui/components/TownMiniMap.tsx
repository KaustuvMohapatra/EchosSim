import type { CSSProperties } from "react";
import { mapLots } from "../../world/map.js";

interface TownMiniMapProps {
  currentLocationId?: string;
  selectedLocationId?: string;
}

/** Compact preview of the same authored lots used by the expanded map. */
export function TownMiniMap({ currentLocationId, selectedLocationId }: TownMiniMapProps) {
  return (
    <div className="town-mini-map" aria-label="Compact town preview">
      <span className="town-mini-map__river" aria-hidden="true" />
      {mapLots().map((lot) => {
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
            ].filter(Boolean).join(" ")}
            title={lot.locationId} />
        );
      })}
    </div>
  );
}
