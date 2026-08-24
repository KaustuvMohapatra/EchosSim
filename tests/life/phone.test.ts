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

    expect(board.accept(inv!.id)).toBe(true);
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
    const before = town.relationships.getOrCreate("npc_rohan", "npc_mira").affinity;
    expect(board.decline(inv.id)).toBe(true);
    expect(town.relationships.getOrCreate("npc_rohan", "npc_mira").affinity)
      .toBeLessThan(before);
  });
});
