import type { ResidentRailItem } from "../models/residentView.js";

interface ResidentRailProps {
  residents: readonly ResidentRailItem[];
  onSelect(id: string): void;
  onControl(id: string): void;
}

export function ResidentRail({ residents, onSelect, onControl }: ResidentRailProps) {
  return (
    <section className="resident-rail" aria-label="Town residents">
      <div className="resident-rail__header">
        <span>Residents</span>
        <small>{residents.length} living here</small>
      </div>
      <div className="resident-rail__scroll">
        {residents.map((resident) => (
          <article key={resident.id}
            className={[
              "resident-chip",
              resident.selected ? "is-selected" : "",
              resident.controlled ? "is-controlled" : "",
              resident.household ? "is-household" : "",
            ].filter(Boolean).join(" ")}>
            <button type="button" className="resident-chip__main"
              onClick={() => onSelect(resident.id)} aria-pressed={resident.selected}>
              <span className="resident-avatar" aria-hidden="true">{resident.initials}</span>
              <span className="resident-chip__copy">
                <strong>{resident.name}</strong>
                {resident.mood ? (
                  <span><i className={`mood-dot mood-dot--${resident.mood.toLowerCase()}`} />{resident.mood}</span>
                ) : (
                  <span className="resident-chip__presence">
                    {resident.visibility === "last-known" ? "Last known" : "Away"}
                  </span>
                )}
                <small title={resident.activity}>{resident.activity}</small>
              </span>
            </button>
            {resident.controlled ? (
              <span className="resident-chip__badge">You</span>
            ) : resident.household ? (
              <button type="button" className="resident-chip__control"
                onClick={() => onControl(resident.id)} aria-label={`Control ${resident.name}`}>
                Control
              </button>
            ) : resident.followed ? (
              <span className="resident-chip__badge">Following</span>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
