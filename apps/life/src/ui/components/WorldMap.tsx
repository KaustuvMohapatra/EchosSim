import type { CSSProperties } from "react";
import type { AgentSummary } from "@echosim/inspector";
import type { LifeLocationSummary } from "../../simulation/LifeModeAdapter.js";
import { DISTRICTS, mapLots } from "../../world/map.js";
import { residentInitials } from "../models/residentView.js";

interface WorldMapProps {
  locations: readonly LifeLocationSummary[];
  agents: readonly AgentSummary[];
  controlledId?: string;
  selectedId?: string;
  destinationId?: string;
  onTravel(id: string, name: string): void;
  onClose(): void;
}

export function WorldMap(props: WorldMapProps) {
  const locations = new Map(props.locations.map((l) => [l.id, l]));
  const controlled = props.agents.find((a) => a.id === props.controlledId);
  const selected = props.agents.find((a) => a.id === props.selectedId);
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
            const current = controlled?.locationId === lot.locationId;
            const hasSelected = selected?.locationId === lot.locationId && selected?.id !== controlled?.id;
            const destination = props.destinationId === lot.locationId;
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
                <small>{location?.isOpen === false ? "Closed" : lot.district?.name ?? "Town"}</small>
                <span className="map-lot__markers">
                  {current && controlled && <i className="is-controlled" title={`${controlled.name} is here`}>
                    {residentInitials(controlled.name)}</i>}
                  {hasSelected && selected && <i title={`${selected.name} is here`}>
                    {residentInitials(selected.name)}</i>}
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
