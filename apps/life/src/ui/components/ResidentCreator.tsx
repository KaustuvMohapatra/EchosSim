import { useEffect, useMemo, useRef, useState } from "react";
import { drawResident, paletteForResident } from "../../characters/pixelResident.js";
import {
  residentAtlasUrl, residentAtlasIndex, nextResidentIdForAppearance,
  RESIDENT_ATLAS_COUNT,
} from "../../characters/residentAssets.js";
import {
  nextResidentId, RESIDENT_PRESETS, validateResidentName,
  type ResidentPreset,
} from "../../simulation/residentCreator.js";
import type { LifeLocationSummary } from "../../simulation/LifeModeAdapter.js";

interface ResidentCreatorProps {
  residentIds: readonly string[];
  locations: readonly LifeLocationSummary[];
  onCreate(request: { id: string; name: string; preset: ResidentPreset; homeLocationId: string }): void;
  onClose(): void;
}

export function ResidentCreator(props: ResidentCreatorProps) {
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<ResidentPreset>("balanced");
  const homes = useMemo(
    () => props.locations.filter((location) => location.id.startsWith("apt_")),
    [props.locations],
  );
  const [homeId, setHomeId] = useState(() =>
    homes.some((home) => home.id === "apt_b") ? "apt_b" : homes[0]?.id ?? "",
  );
  // Location availability can change while the panel is mounted. Never keep an
  // invisible, stale selection that silently prevents a valid submission.
  const selectedHomeId = homes.some((home) => home.id === homeId)
    ? homeId : homes[0]?.id ?? "";
  const [appearance, setAppearance] = useState(
    () => residentAtlasIndex(nextResidentId(props.residentIds)),
  );
  const previewId = nextResidentIdForAppearance(props.residentIds, appearance);
  const preview = useRef<HTMLCanvasElement | null>(null);
  const error = name.length > 0 ? validateResidentName(name) : null;
  const selected = RESIDENT_PRESETS.find((p) => p.id === preset)!;

  useEffect(() => {
    const canvas = preview.current;
    const context = canvas?.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, 32, 48);
    context.imageSmoothingEnabled = false;
    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, 32, 48);
      // Precisely the same front-facing frame from the checked-in world atlas.
      context.drawImage(image, 0, 0, 32, 48, 0, 0, 32, 48);
    };
    image.onerror = () => {
      context.clearRect(0, 0, 32, 48);
      drawResident(context, paletteForResident(previewId), 0, 0);
    };
    image.src = residentAtlasUrl(previewId);
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [previewId]);

  return (
    <aside className="side-panel resident-creator" aria-label="Create a new resident">
      <div className="side-panel__top">
        <span><small>Population sandbox</small><strong>New Resident</strong></span>
        <button type="button" className="icon-button" onClick={props.onClose}
          aria-label="Close resident creator">×</button>
      </div>
      <form className="side-panel__scroll resident-creator__form" onSubmit={(event) => {
        event.preventDefault();
        if (validateResidentName(name) || !selectedHomeId) return;
        props.onCreate({ id: previewId, name: name.trim(), preset, homeLocationId: selectedHomeId });
      }}>
        <div className="resident-creator__hero">
          <div className="resident-creator__portrait" aria-label="Pixel art resident preview">
            <canvas ref={preview} width={32} height={48} role="img"
              aria-label="Preview of the new resident's pixel art appearance" />
          </div>
          <div>
            <strong>A new story begins</strong>
            <small>Look {String(appearance + 1).padStart(2, "0")} of {RESIDENT_ATLAS_COUNT}</small>
            <div className="resident-creator__look-controls" aria-label="Resident appearance">
              <button type="button" aria-label="Previous look"
                onClick={() => setAppearance((n) => (n + RESIDENT_ATLAS_COUNT - 1) % RESIDENT_ATLAS_COUNT)}>
                ‹
              </button>
              <button type="button" aria-label="Next look"
                onClick={() => setAppearance((n) => (n + 1) % RESIDENT_ATLAS_COUNT)}>
                ›
              </button>
            </div>
            <p>New residents join the same simulation as everyone else. They will
              develop their own needs, routines, relationships and memories.</p>
          </div>
        </div>
        <label className="creator-field">
          <span>Name</span>
          <input type="text" maxLength={32} autoComplete="off" value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Rowan Park" />
          {error && <small className="creator-error" role="status">{error}</small>}
        </label>
        <fieldset className="creator-presets">
          <legend>Starting personality</legend>
          {RESIDENT_PRESETS.map((option) => (
            <label key={option.id}
              className={option.id === preset ? "creator-preset is-active" : "creator-preset"}>
              <input type="radio" name="resident-preset" value={option.id}
                checked={option.id === preset}
                onChange={() => setPreset(option.id)} />
              <span><strong>{option.name}</strong>
                <small>{option.description}</small></span>
            </label>
          ))}
        </fieldset>
        <label className="creator-field">
          <span>Move into</span>
          <select value={selectedHomeId} onChange={(event) => setHomeId(event.target.value)}>
            {homes.map((home) => <option key={home.id} value={home.id}>{home.name}</option>)}
          </select>
        </label>
        <div className="resident-creator__note">
          <strong>{selected.name}</strong>
          <span>Personality is a starting influence, not a fixed script.
            Experiences and relationships will shape this resident over time.</span>
        </div>
        <button className="primary-button creator-submit" type="submit"
          disabled={!!validateResidentName(name) || homes.length === 0}>
          Add resident to town
        </button>
      </form>
    </aside>
  );
}
