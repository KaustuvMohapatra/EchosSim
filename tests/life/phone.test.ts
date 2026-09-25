/** Sprint 53 — messages, calendar, invitations (low-strength remote life). */
import { describe, expect, it } from "vitest";
import { createAuthoredTown, createDemoTown } from "@echosim/content";
import {
  InvitationBoard, MessageLog, workShifts, deliverMessage,
} from "@echosim/simulation";

describe("S53: messaging", () => {
  it("delivers a weak social nudge plus a receiver memory", () => {
    const { town } = createDemoTown(4242);
    const log = new MessageLog();
    const famBefore =
      town.relationships.tryGet("npc_rohan", "npc_mira")?.familiarity ?? 0;

    const m = deliverMessage(town, log, "npc_mira", "npc_rohan", "coffee later?");
    expect(m).not.toBeNull();

    const rel = town.relationships.getOrCreate("npc_rohan", "npc_mira");
    expect(rel.familiarity).toBeGreaterThan(famBefore);
    const mem = [...town.memory.storeFor("npc_rohan").all];
    expect(mem.some((x) => x.eventType === "message")).toBe(true);
  });

  it("message log supports per-pair and inbox views", () => {
    const log = new MessageLog();
    log.send("a", "b", "hi", 10);
    log.send("b", "a", "hey", 12);
    log.send("a", "c", "yo", 14);
    expect(log.between("a", "b")).toHaveLength(2);
    expect(log.inboxFor("c")).toHaveLength(1);
    expect(log.forAgent("a").map((message) => message.id)).toEqual([1, 2, 3]);
    expect(log.forAgent("b").map((message) => message.id)).toEqual([1, 2]);
  });
});

describe("S53: calendar", () => {
  it("lists upcoming shifts for employed residents within horizon", () => {
    const { town } = createAuthoredTown(7001);
    for (let i = 0; i < 60; i++) town.clock.advance({ totalMinutes: 10 });
    const shifts = workShifts(town, "npc_mira", 7);
    expect(shifts.length).toBeGreaterThan(0);
    for (const s of shifts)
      expect(s.atMinutes).toBeGreaterThanOrEqual(town.clock.currentTime.totalMinutes);
  });

  it("unemployed residents have empty calendars", () => {
    const { town } = createDemoTown(7001);
    expect(workShifts(town, "npc_rohan", 7)).toHaveLength(0);
  });
});

describe("S53: invitations", () => {
  it("rejects invalid, past and duplicate pending commitments", () => {
    const { town } = createAuthoredTown(7001);
    const board = new InvitationBoard(town);
    town.relationships.import("npc_anika", "npc_mira", {
      familiarity: 0.5, affinity: 0.6, trust: 0.4, respect: 0,
      attraction: 0, fear: 0, grievance: 0, obligation: 0,
    });
    const now = town.clock.currentTime.totalMinutes;

    expect(board.maybeInvite("npc_mira", "npc_anika", "coffee", "cafe", now))
      .toBeNull();
    expect(board.maybeInvite("npc_mira", "npc_anika", "coffee", "missing", now + 120))
      .toBeNull();

    const first = board.maybeInvite(
      "npc_mira", "npc_anika", "coffee", "cafe", now + 120);
    expect(first).not.toBeNull();
    expect(board.maybeInvite(
      "npc_anika", "npc_mira", "coffee", "cafe", now + 180)).toBeNull();
  });

  it("turns an Invite conversation into a real pending commitment", () => {
    const { town, miraId, rohanId } = createDemoTown(7001);
    const location = town.agentsById.get(miraId)?.currentLocationId;
    expect(location).toBeDefined();
    town.relationships.import(rohanId, miraId, {
      familiarity: 0.7, affinity: 0.7, trust: 0.5, respect: 0,
      attraction: 0, fear: 0, grievance: 0, obligation: 0,
    });

    const atMinutes = town.clock.currentTime.totalMinutes;
    town.events.publish("sim:conversation", {
      initiator: miraId,
      listener: rohanId,
      intent: "Invite",
      topicLabel: "the neighbourhood",
      utterances: ["Want to hang out here later?"],
      atMinutes,
    });

    expect(town.invitations.forAgent(rohanId)).toEqual([
      expect.objectContaining({
        from: miraId,
        to: rohanId,
        activityLabel: "hanging out",
        lotId: location,
        atMinutes: atMinutes + 120,
        status: "pending",
      }),
    ]);
  });

  it("expires stale pending invitations and refuses late responses", () => {
    const { town } = createAuthoredTown(7001);
    town.relationships.import("npc_anika", "npc_mira", {
      familiarity: 0.5, affinity: 0.6, trust: 0.4, respect: 0,
      attraction: 0, fear: 0, grievance: 0, obligation: 0,
    });
    const now = town.clock.currentTime.totalMinutes;
    const inv = town.invitations.maybeInvite(
      "npc_mira", "npc_anika", "coffee", "cafe", now + 20)!;
    expect(inv.status).toBe("pending");

    town.clock.advance({ totalMinutes: 20 });
    expect(town.invitations.get(inv.id)?.status).toBe("expired");
    expect(town.invitations.pending()).toHaveLength(0);
    expect(town.invitations.accept(inv.id)).toBe(false);
    expect(town.invitations.decline(inv.id)).toBe(false);
  });

  it("requires affinity; accept commits both parties via memories", () => {
    const { town } = createAuthoredTown(7001);
    const board = new InvitationBoard(town);

    // Low affinity → refused.
    expect(board.maybeInvite("npc_mira", "npc_anika", "coffee", "cafe", 900))
      .toBeNull();

    // Anika warms to Mira enough to invite/be invited.
    town.relationships.import("npc_anika", "npc_mira", {
      familiarity: 0.5, affinity: 0.6, trust: 0.4, respect: 0,
      attraction: 0, fear: 0, grievance: 0, obligation: 0,
    });
    const inv = board.maybeInvite("npc_mira", "npc_anika", "coffee", "cafe", 900);
    expect(inv).not.toBeNull();
    expect(board.pending()).toHaveLength(1);

    const resolved: Array<{ status: string }> = [];
    town.events.subscribe("sim:invitation-resolved",
      (event) => resolved.push(event as { status: string }));

    expect(board.accept(inv!.id)).toBe(true);
    expect(resolved).toEqual([expect.objectContaining({ status: "accepted" })]);
    expect(board.forAgent("npc_mira")).toEqual([
      expect.objectContaining({ id: inv!.id, status: "accepted" }),
    ]);
    expect(board.forAgent("npc_rohan")).toHaveLength(0);
    const mem = [...town.memory.storeFor("npc_anika").all]
      .filter((m) => m.eventType === "plan");
    expect(mem.length).toBeGreaterThan(0);
    expect(board.pending()).toHaveLength(0);
  });

  it("declining leaves a small social mark", () => {
    const { town } = createAuthoredTown(7001);
    const board = new InvitationBoard(town);
    town.relationships.import("npc_rohan", "npc_mira", {
      familiarity: 0.5, affinity: 0.5, trust: 0.3, respect: 0,
      attraction: 0, fear: 0, grievance: 0, obligation: 0,
    });
    const inv = board.maybeInvite("npc_mira", "npc_rohan", "a walk", "park", 1000)!;
    const resolved: Array<{ status: string }> = [];
    town.events.subscribe("sim:invitation-resolved",
      (event) => resolved.push(event as { status: string }));
    const before = town.relationships.getOrCreate("npc_rohan", "npc_mira").affinity;
    expect(board.decline(inv.id)).toBe(true);
    expect(resolved).toEqual([expect.objectContaining({ status: "declined" })]);
    expect(town.relationships.getOrCreate("npc_rohan", "npc_mira").affinity)
      .toBeLessThan(before);
  });
});
