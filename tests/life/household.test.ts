/** Sprint 49 — households + switchable characters. */
import { describe, expect, it } from "vitest";
import { LifeModeAdapter } from "../../apps/life/src/simulation/LifeModeAdapter.js";
import {
  PlayerAgentController,
} from "../../apps/life/src/simulation/PlayerAgentController.js";

function steps(a: LifeModeAdapter, n: number): void {
  for (let i = 0; i < n; i++) a.stepOnce();
}

describe("S49: household control switching", () => {
  it("player starts in a household with co-members", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const p = new PlayerAgentController(a);
    // Authored content puts apt_b residents in fam_birch (Household).
    expect(p.householdIds().length).toBeGreaterThanOrEqual(1);
    expect(p.householdMembers()).toContain(a.playerId);
    p.dispose(); a.dispose();
  });

  it("switching within the household retargets commands and the LOD gate", { timeout: 90_000 }, () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const p = new PlayerAgentController(a);
    steps(a, 40);

    const member = p.householdMembers().find((m) => m !== a.playerId)!;
    expect(member).toBeDefined();
    expect(p.switchTo(member)).toBe(true);
    expect(p.controlled).toBe(member);

    // Queued move now drives the NEWLY controlled resident.
    p.enqueueMove("cafe", "Corner Cafe");
    a.stepOnce();
    expect(a.lod.levelOf(member)).toBe(2);       // manual gate on them…
    expect(a.lod.levelOf(a.playerId)).toBe(0);   // …while the player resumes autonomy

    drainTo(a, p);
    const s = a.town.agentsById.get(member)!;
    expect(s.currentLocationId).toBe("cafe");

    // Switch back; previous member returns to full cognition.
    expect(p.switchTo(a.playerId)).toBe(true);
    expect(a.lod.levelOf(member)).toBe(0);
    p.dispose(); a.dispose();
  });

  it("refuses switching to residents outside the household", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const p = new PlayerAgentController(a);
    // Mira is in fam_alders + club_books — not the player's birch household.
    expect(p.canSwitchTo("npc_mira")).toBe(false);
    expect(p.switchTo("npc_mira")).toBe(false);
    expect(p.controlled).toBe(a.playerId);
    p.dispose(); a.dispose();
  });

  function drainTo(a: LifeModeAdapter, p: PlayerAgentController): void {
    let i = 0;
    while (p.busy && i++ < 600) a.stepOnce();
  }
});

