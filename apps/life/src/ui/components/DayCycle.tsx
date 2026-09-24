import type { TimeInfo } from "@echosim/inspector";
import { dayCycleView } from "../models/townView.js";

export function DayCycle({ time }: { time?: TimeInfo }) {
  if (!time) return <div className="day-cycle day-cycle--loading">Starting the day…</div>;
  const view = dayCycleView(time);
  return (
    <div className="day-cycle" aria-label={`${view.current}, ${time.hhmm}`}>
      <div className="day-cycle__compact">
        <span className="day-cycle__dot" aria-hidden="true" />
        <span>{view.current}</span>
        <strong>{time.hhmm}</strong>
      </div>
      <div className="day-cycle__segments" aria-hidden="true">
        {view.periods.map((period) => (
          <div key={period.name}
            className={`day-cycle__segment${period.active ? " is-active" : ""}`}>
            <span>{period.name}</span>
            <small>{period.tagline}</small>
          </div>
        ))}
      </div>
      <div className="day-cycle__track" aria-hidden="true">
        <span className="day-cycle__fill" style={{ width: `${view.dayProgress * 100}%` }} />
        <span className="day-cycle__marker" style={{ left: `${view.dayProgress * 100}%` }} />
      </div>
    </div>
  );
}
