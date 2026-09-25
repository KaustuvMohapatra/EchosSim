/**
 * Life-mode social extras (Sprint 53): remote messages, calendar queries and
 * NPC-initiated invitations. All effects flow through existing systems and
 * stay deliberately low-strength compared to face-to-face interaction.
 */
import type { Town } from "@echosim/simulation";
import type { SkillName } from "@echosim/social";

export interface Message {
  id: number;
  from: string;
  to: string;
  text: string;
  atMinutes: number;
}

export class MessageLog {
  private readonly messages: Message[] = [];
  private nextId = 1;
  constructor(private readonly capacity = 200) {}

  send(from: string, to: string, text: string, atMinutes: number): Message {
    const m: Message = { id: this.nextId++, from, to, text, atMinutes };
    this.messages.push(m);
    if (this.messages.length > this.capacity) this.messages.shift();
    return m;
  }

  between(a: string, b: string): Message[] {
    return this.messages.filter((m) =>
      (m.from === a && m.to === b) || (m.from === b && m.to === a));
  }

  inboxFor(agentId: string): Message[] {
    return this.messages.filter((m) => m.to === agentId);
  }
}

/**
 * Remote chat: much weaker than talking in person (spec §78) — a small
 * familiarity/trust nudge plus a lightweight memory for the receiver.
 */
export function deliverMessage(town: Town, log: MessageLog,
  from: string, to: string, text: string): Message | null {
  if (!town.residents.tryMind(to)) return null;
  const now = town.clock.currentTime.totalMinutes;
  const msg = log.send(from, to, text, now);

  const rel = town.relationships.getOrCreate(to, from);
  rel.familiarity = Math.min(1, rel.familiarity + 0.01);
  rel.affinity = Math.max(-1, Math.min(1, rel.affinity + 0.005));
  town.memory.storeFor(to).add(now, (id) => ({
    id,
    timestampMinutes: now,
    eventType: "message",
    subject: from,
    summary: `${from} messaged: ${text}`,
    importance: 0.18,
    valence: 0.05,
    confidence: 1,
    source: 0 as never,
    sourceEventId: msg.id,
    accessCount: 0,
    lastAccessMinutes: now,
  }));
  return msg;
}

// ---------------- calendar ----------------

export interface CalendarEntry {
  atMinutes: number;
  label: string;
  kind: "shift" | "meeting" | "custom";
}

/** Next 7 days of the resident's work shifts. */
export function workShifts(town: Town, agentId: string, horizonDays = 7): CalendarEntry[] {
  const mind = town.residents.mind(agentId);
  if (!mind.job) return [];
  const out: CalendarEntry[] = [];
  const startDay = Math.floor(town.clock.currentTime.totalMinutes / 1440);
  for (let d = 0; d <= horizonDays; d++) {
    if (mind.isRestDayToday((startDay + d) * 1440)) continue;
    out.push({
      atMinutes: (startDay + d) * 1440 + mind.job.shiftStartMinuteOfDay,
      label: `Shift — ${mind.job.title}`,
      kind: "shift",
    });
  }
  return out.filter((e) => e.atMinutes >= town.clock.currentTime.totalMinutes);
}

// ---------------- invitations ----------------

export interface Invitation {
  id: number;
  from: string;
  to: string;
  activityLabel: string;
  lotId: string;
  atMinutes: number;
  status: "pending" | "accepted" | "declined";
}

export class InvitationBoard {
  private readonly items = new Map<number, Invitation>();
  private nextId = 1;
  /** Affinity above which an NPC may invite the player. */
  inviteAffinity = 0.3;

  constructor(private readonly town: Town) {}

  maybeInvite(from: string, to: string,
    activityLabel: string, lotId: string, atMinutes: number): Invitation | null {
    const rel = this.town.relationships.tryGet(to, from); // inviter must be liked
    if (!rel || rel.affinity < this.inviteAffinity) return null;
    const inv: Invitation = {
      id: this.nextId++, from, to, activityLabel, lotId, atMinutes,
      status: "pending",
    };
    this.items.set(inv.id, inv);
    this.town.events.publish("sim:invitation", { ...inv });
    return inv;
  }

  get(id: number): Invitation | undefined { return this.items.get(id); }
  pending(): Invitation[] {
    return [...this.items.values()].filter((i) => i.status === "pending");
  }

  /** Read-only presentation view for one participant, including resolved items. */
  forAgent(agentId: string): Invitation[] {
    return [...this.items.values()]
      .filter((i) => i.from === agentId || i.to === agentId)
      .map((i) => ({ ...i }))
      .sort((a, b) => b.atMinutes - a.atMinutes || b.id - a.id);
  }

  /** Accepting creates a soft commitment memory for both parties. */
  accept(id: number): boolean {
    const inv = this.items.get(id);
    if (!inv || inv.status !== "pending") return false;
    inv.status = "accepted";
    for (const who of [inv.from, inv.to]) {
      const store = this.town.memory.storeFor(who);
      const now = this.town.clock.currentTime.totalMinutes;
      store.add(now, (mid) => ({
        id: mid,
        timestampMinutes: now,
        eventType: "plan",
        subject: inv.from === who ? inv.to : inv.from,
        summary: `agreed to ${inv.activityLabel} at ${inv.lotId}`,
        importance: 0.45,
        valence: 0.4,
        confidence: 1,
        source: 0 as never,
        sourceEventId: inv.id,
        accessCount: 0,
        lastAccessMinutes: now,
      }));
    }
    return true;
  }

  /** Declining leaves a small social mark. */
  decline(id: number): boolean {
    const inv = this.items.get(id);
    if (!inv || inv.status !== "pending") return false;
    inv.status = "declined";
    const rel = this.town.relationships.getOrCreate(inv.to, inv.from);
    rel.affinity = Math.max(-1, rel.affinity - 0.04);
    rel.grievance = Math.min(1, rel.grievance + 0.03);
    return true;
  }
}


// Re-export for convenience in life UI.
export type { SkillName };

