import type { AgentInspectorSnapshot } from "@echosim/inspector";
import {
  moodOf, readableActivity, relevantNeeds, residentInitials,
} from "../models/residentView.js";

interface ControlledResidentCardProps {
  agent?: AgentInspectorSnapshot;
  onProfile(): void;
}

export function ControlledResidentCard({ agent, onProfile }: ControlledResidentCardProps) {
  if (!agent) return null;
  const needs = relevantNeeds(agent, 3);
  return (
    <section className="controlled-card" data-testid="character-card">
      <button type="button" className="controlled-card__profile" onClick={onProfile}
        aria-label={`Open ${agent.summary.name}'s profile`}>
        <span className="resident-avatar resident-avatar--large" aria-hidden="true">
          {residentInitials(agent.summary.name)}
        </span>
        <span className="controlled-card__identity">
          <small>Playing as</small>
          <strong>{agent.summary.name}</strong>
          <span><i className={`mood-dot mood-dot--${moodOf(agent).toLowerCase()}`} />{moodOf(agent)}</span>
        </span>
        <span className="controlled-card__chevron" aria-hidden="true">›</span>
      </button>
      <div className="controlled-card__activity">
        <strong>{readableActivity(agent.summary)}</strong>
        <span>{agent.summary.locationName ?? "Location unavailable"}</span>
      </div>
      <div className="need-list" aria-label="Needs that matter most right now">
        {needs.map((need) => (
          <div className="need-row" key={need.key}>
            <span>{need.key}</span>
            <span className="need-track" aria-label={`${need.key}: ${need.level}`}>
              <i className={`need-fill need-fill--${need.level}`}
                style={{ width: `${need.fill * 100}%` }} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
