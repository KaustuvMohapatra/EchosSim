/** The round-trip contract: a saved world IS the same world. */
import { describe, expect, it } from "vitest";
import { createDemoTown } from "@echosim/content";
import { saveToJson, restoreFromJson } from "@echosim/persistence";
import { UnsupportedSaveVersionException } from "@echosim/persistence";
import type { Town } from "@echosim/simulation";
import type { PlanningDirector } from "@echosim/simulation";

export function step(town: Town, director: PlanningDirector, minutes: number): void {
  for (let i = 0; i < minutes; i += 10) {
    town.cognition.advanceNeeds({ totalMinutes: 10 });
    town.clock.advance({ totalMinutes: 10 });
    director.tickAll();
  }
}

function fingerprint(town: Town, director: PlanningDirector): string {
  const parts: unknown[] = [
    town.clock.currentTime.totalMinutes, town.weather.current,
  ];
  for (const id of town.residents.orderedIds()) {
    const m = town.residents.mind(id);
    const state = town.agentsById.get(id);
    parts.push(id,
      state?.hasLocation ? state.currentLocationId : null,
      [...m.needs.all()].map((n) => n.current.toFixed(9)).join(","),
      m.emotionValence.toFixed(9), m.money, m.committedGoal?.id ?? null,
      [...m.plannerMemory].sort().join("|"),
      [...m.inventory].sort().join("|"));
    const store = town.memory.storeFor(id);
    parts.push(store.all.map((x) =>
      `${x.id}:${x.importance.toFixed(9)}:${x.accessCount}:${x.lastAccessMinutes}`).join(";"));
    parts.push(town.skills.allOf(id).map((skill) =>
      `${skill.skill}:${skill.xp}:${skill.level}`).join(";"));
    parts.push(town.perception.observationsOf(id).map((observation) =>
      `${observation.eventId}:${observation.eventType}:${observation.actors.join(",")}:${observation.where ?? "-"}:${observation.timestampMinutes}`
    ).join(";"));
  }
  parts.push([...town.relationships.all()].map((l) =>
    `${l.from}>${l.to}:` +
    ["familiarity","affinity","trust","respect","attraction","fear","grievance","obligation"]
      .map((k) => l.rel[k as keyof typeof l.rel].toFixed(9)).join(",")
  ).sort());
  parts.push(town.beliefs.owners().map(({ owner, store }) =>
    `${owner}:` + store.all.map((b) =>
      `${b.subjectKey}|${b.predicate}|${b.stance.toFixed(9)}|${b.confidence.toFixed(9)}|${b.hopCount}|${b.sourceAgent ?? "-"}`
    ).sort().join(";")).sort());
  parts.push(town.messages.all().map((m) =>
    `${m.id}:${m.from}>${m.to}:${m.atMinutes}:${m.text}`).join(";"));
  parts.push(town.invitations.all().map((i) =>
    `${i.id}:${i.from}>${i.to}:${i.activityLabel}:${i.lotId}:${i.atMinutes}:${i.status}`).join(";"));
  const storyState = town.stories.snapshot();
  parts.push(storyState.stories.map((story) =>
    `${story.id}:${story.day}:${story.category}:${story.visibility}:${story.participants.join(",")}:${story.text}`
  ).join(";"));
  parts.push(storyState.seenFriendPairs.join(";"));
  parts.push(director.totalPlansCreated, director.totalPlansSucceeded,
    director.totalPlansFailed);
  return JSON.stringify(parts);
}

describe("persistence: mid-flight round trip", () => {
  it("restored and original towns stay byte-identical going forward", () => {
    const a = createDemoTown(7001);
    step(a.town, a.director, 480); // wake-up + morning activity, plans in flight

    // Mid-flight snapshot with at least one running plan if possible.
    const json = saveToJson(a.town, a.director);

    const b = restoreFromJson(json);

    expect(b.town.clock.currentTime.totalMinutes).toBe(
      a.town.clock.currentTime.totalMinutes);

    step(a.town, a.director, 360);
    step(b.town, b.director, 360);

    expect(fingerprint(b.town, b.director)).toBe(fingerprint(a.town, a.director));
  });

  it("restore is deterministic: two restores of the same JSON agree", () => {
    const a = createDemoTown(4242);
    step(a.town, a.director, 240);
    const json = saveToJson(a.town, a.director);

    const b1 = restoreFromJson(json);
    const b2 = restoreFromJson(json);
    expect(fingerprint(b1.town, b1.director)).toBe(fingerprint(b2.town, b2.director));
  });

  it("round-trips town stories and friendship announcement guards", () => {
    const a = createDemoTown(7001);
    a.town.stories.noteFriendship(a.miraId, a.rohanId, "Friend");
    a.town.events.publish("sim:promoted", {
      agent: a.miraId,
      fromTitle: "Junior",
      toTitle: "Senior",
      income: 20,
    });
    const before = a.town.stories.snapshot();
    expect(before.stories.length).toBeGreaterThanOrEqual(2);

    const restored = restoreFromJson(saveToJson(a.town, a.director));
    expect(restored.town.stories.snapshot()).toEqual(before);

    const countBefore = restored.town.stories.all().length;
    restored.town.stories.noteFriendship(a.miraId, a.rohanId, "Friend");
    expect(restored.town.stories.all()).toHaveLength(countBefore);
  });

  it("round-trips recent resident perception without replaying side effects", () => {
    const a = createDemoTown(7001);
    const viewer = a.miraId;
    const target = a.rohanId;
    const location = a.town.agentsById.get(viewer)?.currentLocationId ??
      a.town.locations.orderedIds[0]!;
    a.town.moveAgent(viewer as never, location as never);
    a.town.moveAgent(target as never, location as never);

    const before = a.town.perception.observationsOf(viewer)
      .map((observation) => ({
        ...observation,
        actors: [...observation.actors],
      }));
    expect(before.length).toBeGreaterThan(0);

    const restored = restoreFromJson(saveToJson(a.town, a.director));
    expect(restored.town.perception.observationsOf(viewer)).toEqual(before);

    const maxBefore = Math.max(...before.map((observation) => observation.eventId));
    const nextId = restored.town.perception.publish(
      "test_after_restore", [viewer], location, 0 as never);
    expect(nextId).toBeGreaterThan(maxBefore);
  });

  it("round-trips skill progression exactly", () => {
    const a = createDemoTown(7001);
    a.town.skills.award(a.miraId, "Cooking", 42);
    a.town.skills.award(a.miraId, "Professional", 95);
    a.town.skills.award(a.rohanId, "Social", 17);

    const restored = restoreFromJson(saveToJson(a.town, a.director));
    expect(restored.town.skills.allOf(a.miraId)).toEqual(
      a.town.skills.allOf(a.miraId));
    expect(restored.town.skills.allOf(a.rohanId)).toEqual(
      a.town.skills.allOf(a.rohanId));
  });

  it("round-trips messages and invitations without replaying side effects", () => {
    const a = createDemoTown(7001);
    const now = a.town.clock.currentTime.totalMinutes;
    a.town.messages.send(a.miraId, a.rohanId, "coffee later?", now);
    a.town.relationships.import(a.rohanId, a.miraId, {
      familiarity: 0.7, affinity: 0.7, trust: 0.5, respect: 0,
      attraction: 0, fear: 0, grievance: 0, obligation: 0,
    });
    const lotId = a.town.locations.orderedIds[0]!;
    const invitation = a.town.invitations.maybeInvite(
      a.miraId, a.rohanId, "hanging out", lotId, now + 120)!;

    const restored = restoreFromJson(saveToJson(a.town, a.director));
    expect(restored.town.messages.all()).toEqual(a.town.messages.all());
    expect(restored.town.invitations.all()).toEqual(a.town.invitations.all());

    const nextMessage = restored.town.messages.send(
      a.miraId, a.rohanId, "still on?", now + 10);
    expect(nextMessage.id).toBeGreaterThan(1);
    restored.town.invitations.decline(invitation.id);
    const nextInvitation = restored.town.invitations.maybeInvite(
      a.miraId, a.rohanId, "a walk", lotId, now + 180)!;
    expect(nextInvitation.id).toBeGreaterThan(invitation.id);
  });

  it("accepts older v3 saves without phone fields", () => {
    const a = createDemoTown(7001);
    const doc = JSON.parse(saveToJson(a.town, a.director)) as {
      messages?: unknown; invitations?: unknown; skillsByOwner?: unknown;
      observationsByOwner?: unknown; townStories?: unknown;
    };
    delete doc.messages;
    delete doc.invitations;
    delete doc.skillsByOwner;
    delete doc.observationsByOwner;
    delete doc.townStories;
    const restored = restoreFromJson(JSON.stringify(doc));
    expect(restored.town.messages.all()).toEqual([]);
    expect(restored.town.invitations.all()).toEqual([]);
    expect(restored.town.skills.allOf(a.miraId)).toEqual([]);
    expect(restored.town.perception.observationsOf(a.miraId)).toEqual([]);
    expect(restored.town.stories.all()).toEqual([]);
  });

  it("rejects saves from a newer schema version gracefully", () => {
    const a = createDemoTown(7001);
    const doc = JSON.parse(saveToJson(a.town, a.director)) as { version: number };
    doc.version = 999;
    expect(() => restoreFromJson(JSON.stringify(doc)))
      .toThrow(UnsupportedSaveVersionException);
  });

  it("JSON is stable across serializations of an unchanged world", () => {
    const a = createDemoTown(4242);
    step(a.town, a.director, 120);
    expect(saveToJson(a.town, a.director)).toBe(saveToJson(a.town, a.director));
  });
});
