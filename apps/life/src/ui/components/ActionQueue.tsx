import { useState } from "react";
import type { LifeApp } from "../../app/bootstrap.js";
import type { AutonomyMode } from "../../simulation/LifeModeAdapter.js";
import { autonomyView } from "../models/residentView.js";

export function ActionQueue({ app }: { app: LifeApp | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!app) return null;
  const items = app.player.items();
  const activeItems = items.filter((item) =>
    item.status === "pending" || item.status === "walking" || item.status === "active");
  const current = activeItems[0];
  const next = activeItems[1];
  const hasFinished = items.some((item) =>
    item.status === "done" || item.status === "failed" || item.status === "cancelled");
  const autonomy = autonomyView(app.player.autonomy);
  const modes: AutonomyMode[] = ["full-manual", "assisted", "autonomous"];

  return (
    <section className={`action-queue${expanded ? " is-expanded" : ""}`}
      data-testid="action-queue">
      <div className="action-queue__head">
        <span>
          <small>Current action</small>
          <strong>{current?.label ?? "No queued action"}</strong>
          {current && <em className="action-queue__state">{statusLabel(current.status)}</em>}
        </span>
        <button type="button" className="icon-button" aria-expanded={expanded}
          aria-label={expanded ? "Collapse action queue" : "Expand action queue"}
          onClick={() => setExpanded((value) => !value)}>
          {expanded ? "−" : "+"}
        </button>
      </div>
      {next && (
        <div className="action-queue__next">
          <small>Next</small>
          <span>{next.label}</span>
        </div>
      )}
      <div className="autonomy-switch" aria-label="Autonomy mode">
        {modes.map((mode) => {
          const view = autonomyView(mode);
          return (
            <button key={mode} type="button" className={mode === autonomy.mode ? "is-active" : ""}
              onClick={() => app.player.setAutonomy(mode)} title={view.description}>
              {view.label}
            </button>
          );
        })}
      </div>
      <p className="action-queue__hint">{autonomy.description}</p>
      {expanded && (
        <div className="action-queue__items">
          {items.length === 0 ? (
            <p className="empty-state">Nothing queued right now.</p>
          ) : items.map((item) => (
            <div className={`queue-item queue-item--${item.status}`} key={item.id}>
              <span className="queue-item__copy">
                <span><i aria-hidden="true" />{item.label}</span>
                <small>{item.detail ?? statusLabel(item.status)}</small>
              </span>
              {(item.status === "pending" || item.status === "walking" || item.status === "active") && (
                <button type="button" onClick={() => app.player.cancel(item.id)}
                  aria-label={`Cancel ${item.label}`}>Cancel</button>
              )}
            </div>
          ))}
          <div className="action-queue__footer">
            {activeItems.length > 0 && (
              <button type="button" className="text-button" onClick={() => app.player.cancelAll()}>
                Cancel all
              </button>
            )}
            {hasFinished && (
              <button type="button" className="text-button" onClick={() => app.player.clearFinished()}>
                Clear history
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}


function statusLabel(status: "pending" | "walking" | "active" | "done" | "failed" | "cancelled"): string {
  switch (status) {
    case "pending": return "Waiting";
    case "walking": return "Travelling";
    case "active": return "In progress";
    case "done": return "Completed";
    case "failed": return "Failed";
    case "cancelled": return "Cancelled";
  }
}
