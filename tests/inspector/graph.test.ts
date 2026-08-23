/** Sprint 20 — social graph read models + visualization components. */
import { describe, expect, it } from "vitest";
import { createDemoTown } from "@echosim/content";
import { SimulationInspector } from "@echosim/inspector";
import { PlanningDirector } from "@echosim/simulation";
import type { Town } from "@echosim/simulation";
import { SocialActionType } from "@echosim/social";

function step(town: Town, director: PlanningDirector, minutes: number): void {
  for (let i = 0; i < minutes; i += 10) {
    town.cognition.advanceNeeds({ totalMinutes: 10 });
    town.clock.advance({ totalMinutes: 10 });
    director.tickAll();
  }
}

describe("S20: relationship graph snapshot", () => {
  it("exposes directional edges with magnitude and label per dimension", () => {
    const { town, director, miraId, rohanId } = createDemoTown(4242);
    const inspector = new SimulationInspector(town, director);
    step(town, director, 30);
    // Rohan insults Mira → Mira's affinity toward Rohan goes negative.
    town.social.attempt(rohanId, miraId, SocialActionType.Insult);

    const g = inspector.getRelationshipGraph({ dimension: "affinity", minMagnitude: 0.01 });
    expect(g.dimension).toBe("affinity");
    expect(g.nodes.map((n) => n.id).sort()).toEqual(
      ["npc_anika", "npc_mira", "npc_rohan"]);

    const miraToRohan = g.edges.find((e) => e.from === miraId && e.to === rohanId);
    const rohanToMira = g.edges.find((e) => e.from === rohanId && e.to === miraId);
    expect(miraToRohan).toBeDefined();
    expect(miraToRohan!.magnitude).toBeLessThan(0); // victim resents insulter
    expect(miraToRohan!.label.length).toBeGreaterThan(0);
    expect(rohanToMira).toBeDefined();

    // Dimension switching reads a different field of the same links.
    const grievance = inspector.getRelationshipGraph({
      dimension: "grievance", minMagnitude: 0.01,
    });
    const grv = grievance.edges.find((e) => e.from === miraId && e.to === rohanId);
    expect(grv!.magnitude).toBeGreaterThanOrEqual(0);

    // Min magnitude filter drops weak ties entirely.
    const strong = inspector.getRelationshipGraph({ dimension: "affinity", minMagnitude: 5 });
    expect(strong.edges).toHaveLength(0);
    expect(strong.nodes).toHaveLength(3); // nodes remain for context
  });

  it("ego mode restricts to first-hop neighbourhoods", () => {
    const { town, director, miraId, rohanId } = createDemoTown(4242);
    const inspector = new SimulationInspector(town, director);
    step(town, director, 30);
    town.social.attempt(rohanId, miraId, SocialActionType.Chat);

    const ego = inspector.getRelationshipGraph({ egoOf: rohanId, hops: 1 });
    expect(ego.egoOf).toBe(rohanId);
    expect(ego.nodes.some((n) => n.id === miraId)).toBe(true);
    // Every edge must touch the ego node in first-hop mode.
    expect(ego.edges.every((e) => e.from === rohanId || e.to === rohanId)).toBe(true);
  });

  it("is side-effect free (graph reads do not alter state)", () => {
    const { town, director, miraId } = createDemoTown(4242);
    const inspector = new SimulationInspector(town, director);
    step(town, director, 120);
    const before = JSON.stringify([
      [...town.relationships.all()].map((l) => [l.from, l.to, { ...l.rel }]).sort(),
      town.beliefs.owners().map((o) => o.owner).sort(),
      town.perception.totalDelivered,
    ]);
    void inspector.getRelationshipGraph({ dimension: "trust" });
    void inspector.getRelationshipGraph({ egoOf: miraId });
    void inspector.getGossipChains();
    const after = JSON.stringify([
      [...town.relationships.all()].map((l) => [l.from, l.to, { ...l.rel }]).sort(),
      town.beliefs.owners().map((o) => o.owner).sort(),
      town.perception.totalDelivered,
    ]);
    expect(after).toBe(before);
  });
});

describe("S20: gossip chain reconstruction", () => {
  it("walks provenance origin → holder and ignores first-hand beliefs", () => {
    const { town, director, miraId, rohanId, anikaId } = createDemoTown(4242);
    const inspector = new SimulationInspector(town, director);
    step(town, director, 30);
    const now = town.clock.currentTime.totalMinutes;

    // Mira forms a first-hand negative belief about Anika…
    town.beliefs.learnDirect(miraId, anikaId, "regard", -0.9, 0.95, 777, now);
    // …and transfers it to Rohan via conversation (hop 1).
    town.events.publish("sim:plan-step-completed", { agent: miraId, action: "act_talk", index: 0 });

    const chains = inspector.getGossipChains();
    expect(chains.length).toBeGreaterThan(0);
    const chain = chains.find(
      (c) => c.beliefSubjectKey === anikaId && c.predicate === "regard")!;
    expect(chain).toBeDefined();
    expect(chain.chain[0]).toBe(miraId);       // origin holds the hop-0 belief
    expect(chain.chain.at(-1)).toBe(rohanId);  // current holder
    expect(chain.chain.length).toBe(2);
    expect(chain.confidence).toBeLessThan(0.95);

    // First-hand beliefs never appear as chains.
    expect(chains.every((c) => c.chain.length >= 2)).toBe(true);
  });
});
