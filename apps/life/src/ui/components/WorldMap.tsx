import type { CSSProperties } from "react";
import type {
  LifeLocationSummary, LifeResidentPresenceSummary,
} from "../../simulation/LifeModeAdapter.js";
import { DISTRICTS, mapLots } from "../../world/map.js";
import { residentInitials } from "../models/residentView.js";
import { residentCountsByLocation } from "../models/townView.js";

interface WorldMapProps {
  locations: readonly LifeLocationSummary[];
  residents: readonly LifeResidentPresenceSummary[];
  controlledId?: string;
  selectedId?: string;
  destinationId?: string;
  onTravel(id: string, name: string): void;
  onClose(): void;
}

export function WorldMap(props: WorldMapProps) {
  const locations = new Map(props.locations.map((l) => [l.id, l]));
  const controlled = props.residents.find((resident) => resident.id === props.controlledId);
  const selected = props.residents.find((resident) => resident.id === props.selectedId);
  const currentResidents = props.residents.flatMap((resident) =>
    resident.current ? [resident.current] : []);
  const residentCounts = residentCountsByLocation(currentResidents);
  return (
    <div className="map-overlay" role="dialog" aria-modal="true" aria-label="Town map"
      onPointerDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <section className="world-map">
        <header className="world-map__head">
          <span><small>EchoSim</small><strong>Town Map</strong>
            <p>Choose an open place to send the controlled resident there.</p></span>
          <button type="button" className="icon-button" onClick={props.onClose} aria-label="Close map">×</button>
        </header>
        <div className="world-map__canvas">
          <div className="world-map__river" aria-hidden="true" />
          {mapLots().map((lot) => {
            const location = locations.get(lot.locationId);
            const current = controlled?.current?.locationId === lot.locationId;
            const selectedLocationId = selected?.current?.locationId ?? selected?.lastKnownLocationId;
            const hasSelected = selectedLocationId === lot.locationId && selected?.id !== controlled?.id;
            const selectedLastKnown = hasSelected && selected?.visibility === "last-known";
            const destination = props.destinationId === lot.locationId;
            const residentCount = residentCounts.get(lot.locationId) ?? 0;
            const style = {
              left: `${lot.x * 100}%`,
              top: `${lot.z * 100}%`,
              width: `${Math.max(7, lot.width * 100)}%`,
              height: `${Math.max(8, lot.depth * 100)}%`,
              "--lot-tint": lot.district?.tint ?? "#8ea29c",
            } as CSSProperties;
            return (
              <button type="button" key={lot.locationId} style={style}
                className={[
                  "map-lot",
                  current ? "is-current" : "",
                  destination ? "is-destination" : "",
                  location?.isOpen === false ? "is-closed" : "",
                ].filter(Boolean).join(" ")}
                disabled={location?.isOpen === false}
                onClick={() => props.onTravel(lot.locationId, location?.name ?? lot.locationId)}>
                <span className="map-lot__name">{location?.name ?? lot.locationId}</span>
                <small>
                  {location?.isOpen === false ? "Closed" : lot.district?.name ?? "Town"}
                  {residentCount > 0 ? ` · ${residentCount} known here` : ""}
                </small>
                <span className="map-lot__markers">
                  {current && controlled && <i className="is-controlled" title={`${controlled.name} is here`}>
                    {residentInitials(controlled.name)}</i>}
                  {hasSelected && selected && (
                    <i className={selectedLastKnown ? "is-last-known" : ""}
                      title={selectedLastKnown
                        ? `${selected.name} was last seen here`
                        : `${selected.name} is here`}>
                      {selectedLastKnown ? "?" : residentInitials(selected.name)}
                    </i>
                  )}
                  {destination && <i className="is-destination" title="Current destination">→</i>}
                </span>
              </button>
            );
          })}
        </div>
        <footer className="world-map__legend">
          <span className="district-legend">
            {DISTRICTS.map((district) => (
              <i key={district.id}><b style={{ background: district.tint }} />{district.name}</i>
            ))}
          </span>
          <span><i className="legend-ring" /> controlled resident <i className="legend-dash" /> destination</span>
        </footer>
      </section>
    </div>
  );
}
