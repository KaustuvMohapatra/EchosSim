import { useEffect, useMemo, useState } from "react";
import type { AgentSummary } from "@echosim/inspector";
import type { LifePersonalSnapshot } from "../../simulation/LifeModeAdapter.js";
import { formatSimMoment } from "../models/personalLifeView.js";
import { residentInitials } from "../models/residentView.js";

interface PhonePanelProps {
  life: LifePersonalSnapshot;
  residents: readonly AgentSummary[];
  names: ReadonlyMap<string, string>;
  locations: ReadonlyMap<string, string>;
  nowMinutes: number;
  onSend(toId: string, text: string): boolean;
  onRespond(invitationId: number, response: "accept" | "decline"): void;
  onTravel(locationId: string, locationName: string): void;
  onClose(): void;
}

type PhoneTab = "messages" | "calendar" | "invitations";

export function PhonePanel(props: PhonePanelProps) {
  const contacts = useMemo(
    () => props.residents.filter((resident) => resident.id !== props.life.agentId),
    [props.residents, props.life.agentId],
  );
  const [tab, setTab] = useState<PhoneTab>("messages");
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (contactId && contacts.some((contact) => contact.id === contactId)) return;
    setContactId(contacts[0]?.id ?? "");
  }, [contactId, contacts]);

  const thread = props.life.messages.filter(
    (message) => message.from === contactId || message.to === contactId,
  );

  const submit = (): void => {
    if (!contactId) return;
    if (props.onSend(contactId, draft)) setDraft("");
  };

  return (
    <aside className="side-panel phone-panel" aria-label="Phone and personal life">
      <div className="side-panel__top">
        <span>
          <small>Personal life</small>
          <strong>Phone</strong>
        </span>
        <button type="button" className="icon-button" onClick={props.onClose}
          aria-label="Close phone">×</button>
      </div>

      <nav className="panel-tabs" aria-label="Phone sections">
        {(["messages", "calendar", "invitations"] as const).map((value) => (
          <button type="button" key={value} className={tab === value ? "is-active" : ""}
            onClick={() => setTab(value)}>
            {value[0]!.toUpperCase() + value.slice(1)}
          </button>
        ))}
      </nav>

      <div className="side-panel__scroll phone-panel__body">
        {tab === "messages" && (
          <section className="phone-messages">
            <label className="phone-contact">
              <span>Conversation</span>
              <select value={contactId} onChange={(event) => setContactId(event.target.value)}>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>{contact.name}</option>
                ))}
              </select>
            </label>

            <div className="message-thread" aria-live="polite">
              {thread.length === 0 ? (
                <p className="empty-state">No messages with this resident yet.</p>
              ) : thread.map((message) => {
                const outgoing = message.from === props.life.agentId;
                return (
                  <article className={`message-bubble${outgoing ? " is-outgoing" : ""}`}
                    key={message.id}>
                    <small>{outgoing ? "You" : props.names.get(message.from) ?? message.from}</small>
                    <p>{message.text}</p>
                    <time>{formatSimMoment(message.atMinutes, props.nowMinutes)}</time>
                  </article>
                );
              })}
            </div>

            <div className="message-composer">
              <input value={draft} maxLength={240}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                placeholder={contactId ? `Message ${props.names.get(contactId) ?? "resident"}` : "No contact"}
                aria-label="Message text" disabled={!contactId} />
              <button type="button" className="primary-button" onClick={submit}
                disabled={!contactId || draft.trim().length === 0}>Send</button>
            </div>
          </section>
        )}

        {tab === "calendar" && (
          <section className="phone-list">
            {props.life.calendar.length === 0 ? (
              <p className="empty-state">No upcoming shifts or social commitments.</p>
            ) : props.life.calendar.map((entry) => {
              const locationName = entry.locationId
                ? props.locations.get(entry.locationId) ?? entry.locationId
                : undefined;
              return (
                <article className={`phone-list__row phone-list__row--${entry.kind}`}
                  key={`${entry.atMinutes}-${entry.label}`}>
                  <span className="phone-list__mark" aria-hidden="true" />
                  <span>
                    <strong>{entry.label}</strong>
                    <small>{formatSimMoment(entry.atMinutes, props.nowMinutes)}
                      {locationName ? ` · ${locationName}` : ""}</small>
                  </span>
                  {entry.kind === "meeting" && entry.locationId && locationName && (
                    <button type="button" className="text-button"
                      onClick={() => props.onTravel(entry.locationId!, locationName)}>
                      Go
                    </button>
                  )}
                </article>
              );
            })}
          </section>
        )}

        {tab === "invitations" && (
          <section className="phone-list">
            {props.life.invitations.length === 0 ? (
              <p className="empty-state">No invitations yet.</p>
            ) : props.life.invitations.map((invitation) => {
              const incoming = invitation.to === props.life.agentId;
              const otherId = incoming ? invitation.from : invitation.to;
              return (
                <article className="invitation-row" key={invitation.id}>
                  <div>
                    <span className="resident-avatar resident-avatar--small" aria-hidden="true">
                      {residentInitials(props.names.get(otherId) ?? otherId)}
                    </span>
                    <span>
                      <strong>{incoming
                        ? `${props.names.get(otherId) ?? otherId} invited you`
                        : `You invited ${props.names.get(otherId) ?? otherId}`}</strong>
                      <small>
                        {invitation.activityLabel} · {props.locations.get(invitation.lotId) ?? invitation.lotId}
                      </small>
                      <time>{formatSimMoment(invitation.atMinutes, props.nowMinutes)}</time>
                    </span>
                  </div>
                  {incoming && invitation.status === "pending" ? (
                    <footer>
                      <button type="button" className="primary-button"
                        onClick={() => props.onRespond(invitation.id, "accept")}>Accept</button>
                      <button type="button" className="secondary-button"
                        onClick={() => props.onRespond(invitation.id, "decline")}>Decline</button>
                    </footer>
                  ) : (
                    <span className={`status-pill status-pill--${invitation.status}`}>
                      {invitation.status}
                    </span>
                  )}
                </article>
              );
            })}
          </section>
        )}
      </div>
    </aside>
  );
}
