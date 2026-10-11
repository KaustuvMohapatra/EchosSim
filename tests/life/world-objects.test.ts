import { describe, expect, it } from "vitest";
import { activityForObject, objectActivityAvailable, performWorldObjectActivity } from "@echosim/simulation";
import { LifeModeAdapter } from "../../apps/life/src/simulation/LifeModeAdapter.js";
import { WorldObjectDirector } from "../../apps/life/src/simulation/WorldObjectDirector.js";
import { BuildController, resetBuildIds } from "../../apps/life/src/build/BuildController.js";
import { InteractionController } from "../../apps/life/src/interaction/InteractionController.js";
import { lotOf } from "../../apps/life/src/world/layout.js";

const bounds = (id: string) => {
  const lot = lotOf(id);
  return lot ? { x1: lot.x - lot.width / 2, x2: lot.x + lot.width / 2,
    z1: lot.z - lot.depth / 2, z2: lot.z + lot.depth / 2 } : undefined;
};

describe("Living World placed-object gameplay", () => {
  it("supports the four new simulation-affecting object types", () => {
    const expectations = [
      ["arcade", "play", "Social"],
      ["easel", "paint", "Creativity"],
      ["garden", "tend", "Fitness"],
      ["noticeboard", "browse", "Knowledge"],
    ] as const;
    for (const [kind, action, skill] of expectations) {
      const spec = activityForObject(kind);
      expect(spec.id).toBe(action);
      expect(spec.skill?.name).toBe(skill);
    }
  });

  it("applies real memory and skills only when the resident can reach the placed object", () => {
    resetBuildIds();
    const adapter = new LifeModeAdapter({ seed: 7001n });
    const build = new BuildController(bounds);
    const ic = new InteractionController(adapter);
    ic.attachBuildController(build);
    const cafe = lotOf("cafe")!;
    expect(build.place("arcade", "cafe", cafe.x + 1, cafe.z + 1).ok).toBe(true);
    const placement = build.list()[0]!;
    expect(ic.builtAffordance(placement.objectId)).toMatchObject({
      id: "play", label: "Play arcade game",
    });
    expect(objectActivityAvailable(adapter.town, "player", placement).ok).toBe(false);
    expect(performWorldObjectActivity(adapter.town, "player", placement, "wrong").ok).toBe(false);

    adapter.town.locations.get("cafe" as never).forceOpen(true);
    adapter.town.moveAgent("player" as never, "cafe" as never);
    const before = adapter.town.memory.storeFor("player").all
      .filter((m) => m.eventType === "world_object").length;
    const result = ic.useBuiltObject(placement.objectId);
    expect(result.ok).toBe(true);
    const memories = adapter.town.memory.storeFor("player").all
      .filter((m) => m.eventType === "world_object");
    expect(memories).toHaveLength(before + 1);
    expect(memories.at(-1)).toMatchObject({
      subject: placement.objectId, where: "cafe",
    });
    expect(adapter.town.skills.allOf("player")
      .some((s) => s.skill === "Social" && s.xp >= 5)).toBe(true);
    expect(ic.useBuiltObject(placement.objectId).ok).toBe(false);

    const saved = adapter.saveWorld();
    const restored = new LifeModeAdapter({ savedWorld: saved });
    expect(objectActivityAvailable(restored.town, "player", placement).ok).toBe(false);
    restored.dispose();

    expect(build.remove(placement.objectId)).toBe(true);
    expect(ic.useBuiltObject(placement.objectId).ok).toBe(false);
    expect(build.undo()).toBe(true);
    expect(build.get(placement.objectId)).toBeDefined();
    ic.dispose();
    adapter.dispose();
  });

  it("autonomous residents can use equipment when already visiting the right venue", () => {
    resetBuildIds();
    const adapter = new LifeModeAdapter({ seed: 7001n });
    const build = new BuildController(bounds);
    const park = lotOf("park")!;
    expect(build.place("garden", "park", park.x, park.z).ok).toBe(true);
    adapter.town.locations.get("park" as never).forceOpen(true);
    adapter.town.moveAgent("npc_mira" as never, "park" as never);
    const director = new WorldObjectDirector(adapter, build, () => "player");
    let entries = 0;
    // Advance only the clock; the resident stays at the park because this
    // specifically tests opportunistic object use, not the GOAP planner.
    for (let i = 0; i < 120; i++) {
      adapter.town.clock.advance({ totalMinutes: 60 });
      adapter.touch();
      entries = adapter.town.memory.storeFor("npc_mira").all
        .filter((m) => m.eventType === "world_object").length;
      if (entries > 0) break;
    }
    expect(entries).toBeGreaterThan(0);
    const owned = adapter.town.memory.storeFor("npc_mira").all
      .filter((m) => m.eventType === "world_object");
    expect(owned[0]?.subject).toBe(build.list()[0]?.objectId);
    expect(adapter.town.memory.storeFor("player").all
      .filter((m) => m.eventType === "world_object")).toHaveLength(0);
    director.dispose();
    adapter.dispose();
  });

  it("removing a built activity stops future autonomous use", () => {
    resetBuildIds();
    const adapter = new LifeModeAdapter({ seed: 7001n });
    const build = new BuildController(bounds);
    const park = lotOf("park")!;
    build.place("garden", "park", park.x, park.z);
    adapter.town.locations.get("park" as never).forceOpen(true);
    adapter.town.moveAgent("npc_mira" as never, "park" as never);
    const director = new WorldObjectDirector(adapter, build, () => "player");
    build.remove(build.list()[0]!.objectId);
    for (let i = 0; i < 30; i++) {
      adapter.town.clock.advance({ totalMinutes: 60 });
      adapter.touch();
    }
    expect(adapter.town.memory.storeFor("npc_mira").all
      .filter((m) => m.eventType === "world_object")).toHaveLength(0);
    director.dispose();
    adapter.dispose();
  });
});
