import { useMemo, useState } from "react";
import type { AgentInspectorSnapshot } from "@echosim/inspector";
import type {
  LifePersonalSnapshot, LifeResidentKnowledgeSummary, LifeResidentPresenceSummary,
} from "../../simulation/LifeModeAdapter.js";
import {
  careerRequirementProgress, formatClockMinute, formatSimMoment, habitText,
  intentionStrengthLabel, intentionText, skillProgress,
} from "../models/personalLifeView.js";
import {
  cleanRelationshipLabel,
  residentProfilePresenceView,
  readableGoal,
  relevantNeeds,
  residentInitials,
} from "../models/residentView.js";

interface ResidentDetailsProps {
  agent: AgentInspectorSnapshot;
  names: ReadonlyMap<string, string>;
  locations: ReadonlyMap<string, string>;
  knowledge: LifeResidentKnowledgeSummary;
  presence: LifeResidentPresenceSummary;
  life?: LifePersonalSnapshot;
  nowMinutes: number;
  controlled: boolean;
  controlledId?: string;
  canControl: boolean;
  followed: boolean;
  onControl(): void;
  onControlMember(id: string): void;
  onFollow(): void;
  onClose(): void;
}

type ProfileTab = "overview" | "relationships" | "memories" | "life";

export function ResidentDetails(props: ResidentDetailsProps) {
  const { agent, names, locations } = props;
  const [tab, setTab] = useState<ProfileTab>("overview");
  const needs = props.knowledge.privateAccess ? relevantNeeds(agent, 3) : [];
  const relationships = useMemo(() =>
    [...props.knowledge.relationships]
      .filter((relationship) => relationship.to !== agent.summary.id ||
        relationship.from !== agent.summary.id)
      .slice(0, 10), [props.knowledge]);
  const memories = props.knowledge.memories.slice(0, 7);
  const presenceView = residentProfilePresenceView(props.presence, props.nowMinutes);
  const tabs: ProfileTab[] = props.life
    ? ["overview", "relationships", "memories", "life"]
    : ["overview", "relationships", "memories"];

  return (
    <aside className="side-panel resident-details" aria-label={`${agent.summary.name} profile`}>
      <div className="side-panel__top">
        <div className="resident-details__identity">
          <span className="resident-avatar resident-avatar--large" aria-hidden="true">
            {residentInitials(agent.summary.name)}
          </span>
          <span>
            <small>{props.controlled ? "Currently controlled" : "Resident"}</small>
            <strong>{agent.summary.name}</strong>
            <span>
              {presenceView.mood && (
                <i className={`mood-dot mood-dot--${presenceView.mood.toLowerCase()}`} />
              )}
              {presenceView.mood ?? presenceView.status}
            </span>
          </span>
        </div>
        <button type="button" className="icon-button" onClick={props.onClose}
          aria-label="Close resident profile">×</button>
      </div>

      <div className="resident-details__actions">
        {props.canControl && !props.controlled && (
          <button type="button" className="primary-button" onClick={props.onControl}>Take control</button>
        )}
        <button type="button" className={props.followed ? "secondary-button is-active" : "secondary-button"}
          onClick={props.onFollow}>
          {props.followed ? "Following" : "Follow stories"}
        </button>
      </div>

      <nav className="panel-tabs" aria-label="Resident profile sections">
        {tabs.map((value) => (
          <button type="button" key={value} className={tab === value ? "is-active" : ""}
            onClick={() => setTab(value)}>
            {value === "relationships" ? "Connections" : value[0]!.toUpperCase() + value.slice(1)}
          </button>
        ))}
      </nav>

      <div className="side-panel__scroll">
        {tab === "overview" && (
          <div className="profile-overview">
            {!props.knowledge.privateAccess && (
              <div className="profile-knowledge-note">
                <small>Known information</small>
                <span>Their private needs, goals, home, work, relationships and memories stay hidden.</span>
              </div>
            )}
            <section className="profile-hero">
              <small>{presenceView.status}</small>
              <strong>{presenceView.activity}</strong>
              <span>{presenceView.location}</span>
            </section>
            {props.knowledge.privateAccess && (
              <dl className="profile-facts">
                <div><dt>Goal</dt><dd>{readableGoal(agent.committedGoalId ?? agent.summary.currentGoal)}</dd></div>
                <div><dt>Home</dt><dd>{agent.homeLocationId
                  ? locations.get(agent.homeLocationId) ?? agent.homeLocationId : "No home listed"}</dd></div>
                <div><dt>Work</dt><dd>{agent.job
                  ? `${agent.job.title} · ${locations.get(agent.job.workplace) ?? agent.job.workplace}`
                  : "Not currently employed"}</dd></div>
              </dl>
            )}
            {props.knowledge.privateAccess && (
              <section className="profile-section">
                <div className="profile-section__title"><strong>Needs to watch</strong><small>Most pressing</small></div>
                <div className="need-list need-list--large">
                  {needs.map((need) => (
                    <div className="need-row" key={need.key}>
                      <span>{need.key}</span>
                      <span className="need-track" aria-label={`${need.key}: ${need.level}`}>
                        <i className={`need-fill need-fill--${need.level}`}
                          style={{ width: `${need.fill * 100}%` }} />
                      </span>
                      <small>{need.level === "critical" ? "Needs attention" : need.level === "warn" ? "Rising" : "Okay"}</small>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === "relationships" && (
          <section className="profile-list">
            {relationships.length === 0 ? (
              <p className="empty-state">{props.knowledge.privateAccess
                ? "No known connections to show yet."
                : "You have not formed a clear connection with this resident yet."}</p>
            ) : relationships.map((relationship) => (
              <div className="profile-list__row" key={relationship.to}>
                <span className="resident-avatar resident-avatar--small" aria-hidden="true">
                  {residentInitials(names.get(relationship.to) ?? relationship.to)}
                </span>
                <span><strong>{names.get(relationship.to) ?? relationship.to}</strong>
                  <small>{cleanRelationshipLabel(relationship.label)}</small></span>
              </div>
            ))}
          </section>
        )}

        {tab === "memories" && (
          <section className="profile-list profile-list--memories">
            {memories.length === 0 ? (
              <p className="empty-state">{props.knowledge.privateAccess
                ? "No recent memories are available to show."
                : "The controlled resident has no remembered interactions with them yet."}</p>
            ) : memories.map((memory) => (
              <div className="memory-row" key={memory.id}>
                <span className={`memory-row__mark${memory.valence < -0.2 ? " is-negative" : memory.valence > 0.2 ? " is-positive" : ""}`} />
                <span><strong>{readableMemory(memory.summary, names)}</strong>
                  <small>{memory.where ? `At ${locations.get(memory.where) ?? memory.where}` : memory.type}</small></span>
              </div>
            ))}
          </section>
        )}

        {tab === "life" && props.life && (
          <div className="life-profile">
            <section className="profile-section life-profile__section">
              <div className="profile-section__title">
                <strong>Household</strong><small>Home life</small>
              </div>
              {props.life.households.length === 0 ? (
                <p className="empty-state">No household is listed.</p>
              ) : props.life.households.map((household) => (
                <div className="life-card" key={household.id}>
                  <strong>{household.name}</strong>
                  <small>{household.homeLocationId
                    ? locations.get(household.homeLocationId) ?? household.homeLocationId
                    : "Home location unavailable"}</small>
                  <div className="household-members" aria-label="Household members">
                    {household.members.map((member) => {
                      const playing = member.id === props.controlledId;
                      return (
                        <button type="button" key={member.id}
                          className={playing ? "is-playing" : ""}
                          onClick={() => !playing && props.onControlMember(member.id)}
                          disabled={playing}
                          aria-label={playing
                            ? `Currently playing as ${member.name}`
                            : `Switch control to ${member.name}`}>
                          <span>{member.name}</span>
                          <small>{playing ? "Playing" : "Switch"}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>

            <section className="profile-section life-profile__section">
              <div className="profile-section__title">
                <strong>Career</strong><small>Current work</small>
              </div>
              {agent.job ? (
                <div className="life-card">
                  <strong>{agent.job.title}</strong>
                  <small>{locations.get(agent.job.workplace) ?? agent.job.workplace}</small>
                  <span>{formatClockMinute(agent.job.shiftStartMinuteOfDay)}–{formatClockMinute(agent.job.shiftEndMinuteOfDay)}</span>
                  {props.life.calendar[0] && (
                    <em>Next: {formatSimMoment(props.life.calendar[0].atMinutes, props.nowMinutes)}</em>
                  )}
                  {props.life.career?.nextTitle && (
                    <div className="career-progress">
                      <span>
                        <strong>Next: {props.life.career.nextTitle}</strong>
                        <small>
                          Professional {props.life.career.professionalLevel}/{props.life.career.requiredProfessionalLevel}
                          {" · "}
                          Shifts {props.life.career.daysAtTier}/{props.life.career.requiredDays}
                        </small>
                      </span>
                      <span className="career-progress__tracks" aria-label="Promotion progress">
                        <i><b style={{ width: `${careerRequirementProgress(
                          props.life.career.professionalLevel,
                          props.life.career.requiredProfessionalLevel,
                        ) * 100}%` }} /></i>
                        <i><b style={{ width: `${careerRequirementProgress(
                          props.life.career.daysAtTier,
                          props.life.career.requiredDays,
                        ) * 100}%` }} /></i>
                      </span>
                    </div>
                  )}
                  {props.life.career && !props.life.career.nextTitle && (
                    <em>Top of the current career track.</em>
                  )}
                </div>
              ) : (
                <p className="empty-state">Not currently employed.</p>
              )}
            </section>

            <section className="profile-section life-profile__section">
              <div className="profile-section__title">
                <strong>Skills</strong><small>Real progression</small>
              </div>
              <div className="skill-list">
                {props.life.skills.map((skill) => (
                  <div className="skill-row" key={skill.name}>
                    <span><strong>{skill.name}</strong><small>Level {skill.level} · {skill.xp} XP</small></span>
                    <span className="skill-track" aria-label={`${skill.name}, level ${skill.level}`}>
                      <i style={{ width: `${skillProgress(skill) * 100}%` }} />
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="profile-section life-profile__section">
              <div className="profile-section__title">
                <strong>Patterns &amp; plans</strong><small>Emergent</small>
              </div>
              {props.life.intentions.length === 0 && props.life.habits.length === 0 ? (
                <p className="empty-state">
                  No strong routines or longer-term social intentions have formed yet.
                </p>
              ) : (
                <div className="pattern-list">
                  {props.life.intentions.map((intention) => (
                    <div className="pattern-row" key={`intention-${intention.kind}-${intention.subjectKey}`}>
                      <span className={`pattern-row__mark pattern-row__mark--${intention.kind}`} aria-hidden="true" />
                      <span>
                        <strong>{intentionText(
                          intention.kind,
                          names.get(intention.subjectKey) ?? intention.subjectKey,
                        )}</strong>
                        <small>{intentionStrengthLabel(intention.strength)}</small>
                      </span>
                    </div>
                  ))}
                  {props.life.habits.map((habit) => (
                    <div className="pattern-row" key={`habit-${habit.behavior}-${habit.targetKey}`}>
                      <span className="pattern-row__mark pattern-row__mark--habit" aria-hidden="true" />
                      <span>
                        <strong>{habitText(
                          habit.behavior,
                          locations.get(habit.targetKey) ?? habit.targetKey,
                          habit.repetitionCount,
                        )}</strong>
                        <small>Routine formed through repeated behaviour</small>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </aside>
  );
}


function readableMemory(summary: string, names: ReadonlyMap<string, string>): string {
  let text = summary;
  for (const [id, name] of names) text = text.replaceAll(id, name);
  return text;
}
