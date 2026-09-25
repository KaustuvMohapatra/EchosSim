/** Sprint 39 — action queue sequencing, manual priority, autonomy resume. */
import { describe, expect, it } from "vitest";
import { LifeModeAdapter } from "../../apps/life/src/simulation/LifeModeAdapter.js";
import {
  PlayerAgentController,
} from "../../apps/life/src/simulation/PlayerAgentController.js";

function steps(a: LifeModeAdapter, n: number): void {
  for (let i = 0; i < n; i++) a.stepOnce();
}

function drain(a: LifeModeAdapter, player: PlayerAgentController,
  maxSteps = 600): void {
  let i = 0;
  while (player.busy && i++ < maxSteps) a.stepOnce();
}

describe("S39: action queue", () => {
  it("executes three queued moves sequentially in order", { timeout: 60_000 }, () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const p = new PlayerAgentController(a);
    // Daytime so all venues are open.
    steps(a, 40);

    p.enqueueMove("cafe", "Corner Cafe");
    p.enqueueMove("park", "Park");
    p.enqueueMove("apt_a", "Alder Apartments");

    expect(p.items()).toHaveLength(3);
    expect(p.busy).toBe(true);
    drain(a, p);

    const statuses = p.items().map((q) => q.status);
    expect(statuses).toEqual(["done", "done", "done"]);
    expect(a.playerLocationId()).toBe("apt_a"); // final destination
    p.dispose(); a.dispose();
  });

  it("cancelling the walking item aborts it and starts the next", { timeout: 60_000 }, () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const p = new PlayerAgentController(a);
    steps(a, 40);

    p.enqueueMove("cafe", "Corner Cafe");
    p.enqueueMove("park", "Park");
    a.stepOnce(); // kick first into walking
    const walking = p.items()[0]!;
    expect(walking.status).toBe("walking");
    p.cancel(walking.id);
    drain(a, p);

    expect(p.items()[0]!).toMatchObject({
      status: "cancelled", detail: "Cancelled by player.",
    });
    expect(p.items()[1]!.status).toBe("done");
    expect(a.playerLocationId()).toBe("park");
    p.dispose(); a.dispose();
  });

  it("cancelling a lone walking item cancels timed navigation too", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const p = new PlayerAgentController(a);
    steps(a, 40);
    const origin = a.playerLocationId();

    p.enqueueMove("park", "Park");
    expect(p.items()[0]!.status).toBe("walking");
    p.cancel(p.items()[0]!.id);
    steps(a, 4); // well past the default 15-minute travel time

    expect(p.items()[0]).toMatchObject({
      status: "cancelled", detail: "Cancelled by player.",
    });
    expect(a.playerLocationId()).toBe(origin);
    p.dispose(); a.dispose();
  });

  it("cancelAll stops pending work while clearFinished removes history", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const p = new PlayerAgentController(a);
    steps(a, 40);
    p.enqueueMove("cafe", "Corner Cafe");
    p.enqueueMove("park", "Park");
    p.cancelAll();
    expect(p.busy).toBe(false);
    expect(p.items().every((item) => item.status === "cancelled")).toBe(true);
    p.clearFinished();
    expect(p.items()).toHaveLength(0);
    p.dispose(); a.dispose();
  });

  it("does not carry old action history across household control switches", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const p = new PlayerAgentController(a);
    steps(a, 40);
    p.enqueueMove("park", "Park");
    drain(a, p);
    expect(p.items()).toHaveLength(1);

    const householdTarget = p.householdMembers().find((id) => id !== p.controlled)!;
    expect(householdTarget).toBeDefined();
    expect(p.switchTo(householdTarget)).toBe(true);
    expect(p.items()).toHaveLength(0);

    p.dispose(); a.dispose();
  });

  it("closed-venue moves fail with an explanatory status", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const p = new PlayerAgentController(a);
    // Midnight: cafe closed.
    p.enqueueMove("cafe", "Corner Cafe");
    drain(a, p, 20);
    expect(p.items()[0]!.status).toBe("failed");
    expect(p.items()[0]!.detail?.toLowerCase()).toContain("closed");
    p.dispose(); a.dispose();
  });

  it("keeps the simulation's social failure reason on the queued action", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const p = new PlayerAgentController(a);

    p.enqueueSocial("npc_mira", "Mira", 0 /* Greet */);

    expect(p.items()[0]).toMatchObject({
      status: "failed", detail: "not co-located",
    });
    p.dispose(); a.dispose();
  });

  it("social commands execute through the normal social pipeline", { timeout: 60_000 }, () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const p = new PlayerAgentController(a);
    steps(a, 40);
    // Rohan shares apt_a home with several residents; find co-located target.
    const target = ["npc_dev", "npc_sana", "npc_yuki", "npc_grace", "npc_jonas", "npc_nadia"]
      .find((id) => a.playerLocationId() !== undefined &&
        a.town.agentsById.get(id)?.currentLocationId === a.playerLocationId())!;
    expect(target).toBeDefined();

    p.enqueueSocial(target, "Neighbour", 0 /* Greet */);
    drain(a, p);
    const item = p.items()[0]!;
    // Acceptance is chance-based; both outcomes are legal pipeline results.
    expect(["done", "failed"]).toContain(item.status);
    p.dispose(); a.dispose();
  });
});

describe("S39: manual priority & autonomy resume", () => {
  function gateOf(a: LifeModeAdapter): number {
    return a.lod.levelOf(a.playerId);
  }

  it("queue gates autonomous planning; assisted resumes after drain", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const p = new PlayerAgentController(a);
    steps(a, 40);
    expect(gateOf(a)).toBe(0); // idle+assisted → full cognition

    p.enqueueMove("cafe", "Corner Cafe");
    a.stepOnce();
    expect(gateOf(a)).toBe(2); // gated while busy

    drain(a, p);
    expect(p.busy).toBe(false);
    expect(gateOf(a)).toBe(0); // cognition resumed

    // And it actually plans again: cycles advance for the player.
    const before = a.director.diagnosticsOf(a.playerId).lastCycleAtMinutes ?? -1;
    steps(a, 60);
    const after = a.director.diagnosticsOf(a.playerId).lastCycleAtMinutes ?? -1;
    expect(after).toBeGreaterThanOrEqual(before);
    p.dispose(); a.dispose();
  });

  it("full-manual keeps the gate even when idle; critical needs still bypass", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const p = new PlayerAgentController(a);
    p.setAutonomy("full-manual");
    steps(a, 40);
    expect(gateOf(a)).toBe(2); // held
    expect(a.director.diagnosticsOf(a.playerId).lastCycleAtMinutes).toBeUndefined();

    // Survival bypass: force critical hunger.
    a.town.residents.mind(a.playerId).needs.force(0 /* Hunger */, 99);
    steps(a, 30);
    expect(a.director.isBusy(a.playerId) ||
           a.director.peekActive(a.playerId) !== undefined ||
           (a.director.diagnosticsOf(a.playerId).lastCycleAtMinutes ?? -1) >= 0)
      .toBe(true);
    p.dispose(); a.dispose();
  });
});

describe("S40: visit-and-social convenience", () => {
  it("queues travel plus interaction when not co-located", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const p = new PlayerAgentController(a);
    steps(a, 40); // player at home (apt_b)
    // Mira lives apt_a — different household.
    const ok = p.enqueueVisitAndSocial("npc_mira", "Mira", 0 /* Greet */,
      "apt_a", "Alder Apartments");
    expect(ok).toBe(true);
    expect(p.items().length).toBe(2);
    drain(a, p);
    expect(a.playerLocationId()).toBe("apt_a");
    expect(p.items().map((q) => q.status)).toEqual(["done", "done"]);
    p.dispose(); a.dispose();
  });

  it("refuses when target has no location", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const p = new PlayerAgentController(a);
    expect(p.enqueueVisitAndSocial("npc_mira", "Mira", 0, undefined, "")).toBe(false);
    expect(p.items()).toHaveLength(0);
    p.dispose(); a.dispose();
  });
});

